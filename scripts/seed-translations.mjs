import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL_WASM_PATH = require.resolve('sql.js/dist/sql-wasm.wasm');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogDir = path.join(root, 'src/lib/i18n/catalog');
const databasePath =
	process.env.DIALOGSYS_TRANSLATIONS_DB?.trim() || path.join(root, 'i18n/translations.sqlite');

async function loadSqlJs() {
	return initSqlJs({
		locateFile: (file) => (file === 'sql-wasm.wasm' ? SQL_WASM_PATH : file),
	});
}

function normalizeLocale(localeTag) {
	const [lang, region = ''] = localeTag.trim().toLowerCase().split('-');
	if (!lang) throw new Error(`Invalid locale: ${localeTag}`);
	return { lang, region, tag: region ? `${lang}-${region}` : lang };
}

function ensureSchema(db) {
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

async function readDatabase(SQL, filePath) {
	try {
		const buffer = await fs.readFile(filePath);
		return new SQL.Database(new Uint8Array(buffer));
	} catch (error) {
		if (error.code === 'ENOENT') return new SQL.Database();
		throw error;
	}
}

async function upsertLocale(localeTag, translations) {
	const entries = Object.entries(translations).filter(
		([key, value]) => typeof key === 'string' && key.trim() && typeof value === 'string',
	);
	if (entries.length === 0) return;

	const { lang, region, tag } = normalizeLocale(localeTag);
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
				$lang: lang,
				$region: region,
				$locale: tag,
				$key: key.trim(),
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
	console.log(`Seeded ${entries.length} strings for ${localeTag}`);
}

async function main() {
	const entries = await fs.readdir(catalogDir);
	const localeFiles = entries.filter((name) => name.endsWith('.json') && name !== 'en.json');
	if (localeFiles.length === 0) {
		console.log('No locale catalogs found to seed.');
		return;
	}

	for (const file of localeFiles) {
		const localeTag = file.replace(/\.json$/, '');
		const translations = JSON.parse(await fs.readFile(path.join(catalogDir, file), 'utf-8'));
		await upsertLocale(localeTag, translations);
	}

	console.log(`Translation database: ${databasePath}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
