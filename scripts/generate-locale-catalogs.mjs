#!/usr/bin/env node
/**
 * Generate locale catalog JSON from English source keys (es.json keys).
 * Uses Google Translate's public endpoint — run occasionally when strings change.
 *
 * Usage: node scripts/generate-locale-catalogs.mjs [locale...]
 * Default: all bundled locales except es (maintained manually).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_LOCALE_TAGS } from './i18n-bundled.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogDir = path.join(root, 'src/lib/i18n/catalog');

const GOOGLE_LANG = {
	zh: 'zh-CN',
	pt: 'pt',
	he: 'iw',
};

const DELAY_MS = 100;
const MAX_RETRIES = 5;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateOne(text, targetLang, attempt = 1) {
	const tl = GOOGLE_LANG[targetLang] ?? targetLang;
	const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'dialogsys-i18n/1.0' },
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) {
			throw new Error(`Translate HTTP ${res.status} for ${targetLang}`);
		}
		const data = await res.json();
		return data[0].map((part) => part[0]).join('');
	} catch (error) {
		if (attempt >= MAX_RETRIES) throw error;
		const backoff = DELAY_MS * 2 ** attempt;
		console.warn(`  retry ${attempt}/${MAX_RETRIES} for ${targetLang} after ${backoff}ms`);
		await sleep(backoff);
		return translateOne(text, targetLang, attempt + 1);
	}
}

async function loadSourceKeys() {
	const esPath = path.join(catalogDir, 'es.json');
	const es = JSON.parse(await fs.readFile(esPath, 'utf-8'));
	return Object.keys(es).sort();
}

async function loadPartialCatalog(locale, keys) {
	const outPath = path.join(catalogDir, `${locale}.json`);
	try {
		const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
		const complete = keys.every(
			(key) => typeof existing[key] === 'string' && existing[key].length > 0,
		);
		return { outPath, existing, complete };
	} catch (error) {
		if (error.code === 'ENOENT') return { outPath, existing: {}, complete: false };
		throw error;
	}
}

async function writeCatalog(outPath, translations) {
	const ordered = Object.fromEntries(
		Object.keys(translations)
			.sort()
			.map((key) => [key, translations[key]]),
	);
	await fs.writeFile(outPath, `${JSON.stringify(ordered, null, '\t')}\n`, 'utf-8');
}

async function translateAll(keys, targetLang) {
	const { outPath, existing, complete } = await loadPartialCatalog(targetLang, keys);
	if (complete) {
		console.log(`  ${targetLang}: already complete (${keys.length} keys), skipping`);
		return existing;
	}

	const result = { ...existing };
	const pending = keys.filter((key) => !result[key]);
	console.log(`  ${targetLang}: ${pending.length} key(s) to translate`);

	for (let i = 0; i < pending.length; i++) {
		const key = pending[i];
		result[key] = await translateOne(key, targetLang);
		const done = keys.length - pending.length + i + 1;
		if (done % 10 === 0 || i === pending.length - 1) {
			process.stdout.write(`  ${targetLang}: ${done}/${keys.length}\r`);
			await writeCatalog(outPath, result);
		}
		await sleep(DELAY_MS);
	}

	process.stdout.write('\n');
	await writeCatalog(outPath, result);
	return result;
}

async function main() {
	const args = process.argv.slice(2);
	const targets = args.length > 0 ? args : BUNDLED_LOCALE_TAGS.filter((locale) => locale !== 'es');
	const keys = await loadSourceKeys();
	console.log(`Source keys: ${keys.length}; targets: ${targets.join(', ')}`);

	for (const locale of targets) {
		if (locale === 'en') continue;
		console.log(`Translating ${locale}…`);
		await translateAll(keys, locale);
		console.log(`Wrote ${path.join(catalogDir, `${locale}.json`)}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
