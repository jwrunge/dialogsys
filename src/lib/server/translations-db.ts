import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { GetTransMapFn } from '@jwrunge/transmut/observer/types';
import type { Database, SqlJsStatic } from 'sql.js';
import { parseLocaleTag } from '../i18n/locales';
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

export function createDatabaseTranslationProvider(databasePath: string): GetTransMapFn {
	return async ({ langCode, region }, keys) => {
		const localeTag = region ? `${langCode}-${region}` : langCode;
		return loadTranslationsFromDatabase(databasePath, localeTag, keys);
	};
}
