import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { GetTransMapFn } from '@jwrunge/transmut/observer/types';
import type { Database, SqlJsStatic } from 'sql.js';
import { parseLocaleTag } from '../i18n/locales';
import { isMachineTranslateEnabled, machineTranslateKeys } from './machine-translate';
import { resolveInitSqlJs } from './sqljs';

const require = createRequire(import.meta.url);
const SQL_WASM_PATH = process.env.SQLJS_WASM_PATH ?? require.resolve('sql.js/dist/sql-wasm.wasm');

let sqlJsInstancePromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
	if (!sqlJsInstancePromise) {
		const initSqlJs = resolveInitSqlJs();
		sqlJsInstancePromise = initSqlJs({
			locateFile: (file: string) => (file === 'sql-wasm.wasm' ? SQL_WASM_PATH : path.resolve(file)),
		});
	}
	return sqlJsInstancePromise;
}

function ensureSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS translations (
			lang TEXT NOT NULL,
			region TEXT NOT NULL DEFAULT '',
			locale TEXT NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			edited INTEGER NOT NULL DEFAULT 0,
			metadata TEXT,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (lang, region, key)
		);
	`);
}

async function readDatabase(SQL: SqlJsStatic, databasePath: string): Promise<Database> {
	try {
		const buffer = await fs.readFile(databasePath);
		return new SQL.Database(new Uint8Array(buffer));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return new SQL.Database();
		}
		throw error;
	}
}

function collectTranslations(
	db: Database,
	lang: string,
	region: string,
	keys: string[],
): Record<string, string> {
	const result: Record<string, string> = {};
	const statement = db.prepare(
		`SELECT value FROM translations WHERE lang = $lang AND region = $region AND key = $key LIMIT 1;`,
	);

	try {
		for (const key of keys) {
			statement.bind({ $lang: lang, $region: region, $key: key });
			if (statement.step()) {
				const row = statement.getAsObject() as { value?: unknown };
				if (typeof row.value === 'string') {
					result[key] = row.value;
				}
			}
			statement.reset();
		}
	} finally {
		statement.free();
	}

	return result;
}

async function upsertTranslations(
	databasePath: string,
	localeTag: string,
	translations: Record<string, string>,
): Promise<void> {
	const entries = Object.entries(translations).filter(
		([key, value]) => key.trim() && typeof value === 'string' && value.trim(),
	);
	if (entries.length === 0) return;

	const { langCode, region } = parseLocaleTag(localeTag);
	const tag = region ? `${langCode}-${region}` : langCode;
	const SQL = await loadSqlJs();
	const db = await readDatabase(SQL, databasePath);
	ensureSchema(db);

	const statement = db.prepare(`
		INSERT INTO translations (lang, region, locale, key, value, edited, metadata, updated_at)
		VALUES ($lang, $region, $locale, $key, $value, 0, NULL, $updated_at)
		ON CONFLICT(lang, region, key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at;
	`);

	const updatedAt = Date.now();
	db.exec('BEGIN IMMEDIATE TRANSACTION;');
	try {
		for (const [key, value] of entries) {
			statement.run({
				$lang: langCode,
				$region: region,
				$locale: tag,
				$key: key,
				$value: value,
				$updated_at: updatedAt,
			});
		}
		db.exec('COMMIT;');
	} catch (error) {
		db.exec('ROLLBACK;');
		throw error;
	} finally {
		statement.free();
	}

	await fs.mkdir(path.dirname(databasePath), { recursive: true });
	await fs.writeFile(databasePath, Buffer.from(db.export()));
	db.close();
}

export async function loadTranslationsFromDatabase(
	databasePath: string,
	localeTag: string,
	keys: string[],
): Promise<Record<string, string>> {
	if (keys.length === 0) return {};

	const { langCode, region } = parseLocaleTag(localeTag);
	const SQL = await loadSqlJs();
	const db = await readDatabase(SQL, databasePath);

	try {
		const primary = collectTranslations(db, langCode, region, keys);
		if (region === '') return primary;

		const missing = keys.filter((key) => !(key in primary));
		if (missing.length === 0) return primary;

		const fallback = collectTranslations(db, langCode, '', missing);
		return { ...fallback, ...primary };
	} finally {
		db.close();
	}
}

type MachineTranslateQueue = { keys: Set<string>; draining: boolean };

const machineTranslateQueues = new Map<string, MachineTranslateQueue>();

function queueMachineTranslations(
	databasePath: string,
	localeTag: string,
	langCode: string,
	missing: string[],
): void {
	if (missing.length === 0 || !isMachineTranslateEnabled()) return;

	let queue = machineTranslateQueues.get(localeTag);
	if (!queue) {
		queue = { keys: new Set(), draining: false };
		machineTranslateQueues.set(localeTag, queue);
	}
	for (const key of missing) queue.keys.add(key);

	if (!queue.draining) {
		queue.draining = true;
		void drainMachineTranslateQueue(databasePath, localeTag, langCode, queue);
	}
}

async function drainMachineTranslateQueue(
	databasePath: string,
	localeTag: string,
	langCode: string,
	queue: MachineTranslateQueue,
): Promise<void> {
	try {
		while (queue.keys.size > 0) {
			const batch = Array.from(queue.keys).slice(0, 24);
			for (const key of batch) queue.keys.delete(key);

			try {
				const machine = await machineTranslateKeys(batch, langCode);
				if (Object.keys(machine).length > 0) {
					await upsertTranslations(databasePath, localeTag, machine);
				}
			} catch {
				for (const key of batch) queue.keys.add(key);
				break;
			}
		}
	} finally {
		queue.draining = false;
		if (queue.keys.size > 0) {
			queue.draining = true;
			void drainMachineTranslateQueue(databasePath, localeTag, langCode, queue);
		}
	}
}

export function createDatabaseTranslationProvider(databasePath: string): GetTransMapFn {
	return async ({ langCode, region }, keys) => {
		const localeTag = region ? `${langCode}-${region}` : langCode;
		const fromDb = await loadTranslationsFromDatabase(databasePath, localeTag, keys);
		const missing = keys.filter((key) => !(key in fromDb));
		queueMachineTranslations(databasePath, localeTag, langCode, missing);
		return fromDb;
	};
}
