#!/usr/bin/env node
/**
 * Validates translation catalogs and flags fragile markup in translatable regions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_LOCALE_TAGS } from './i18n-bundled.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogDir = path.join(root, 'src/lib/i18n/catalog');
const manifestPath = path.join(root, 'src/lib/i18n/messages.manifest.json');
const srcDir = path.join(root, 'src');

const BUNDLED = BUNDLED_LOCALE_TAGS;

async function loadJson(filePath) {
	return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function syncManifest(keys) {
	const manifest = { version: 1, keys };
	await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf-8');
}

async function walk(dir, files = []) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue;
			await walk(full, files);
		} else if (/\.(svelte|astro)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

function findMarkupIssues(content, filePath) {
	const issues = [];
	const rel = path.relative(root, filePath);
	if (!content.includes('data-transmut="include"')) return issues;

	// Multi-line English text between tags inside translatable regions
	const blocks = content.split('data-transmut="include"').slice(1);
	for (const block of blocks) {
		const end = block.search(/data-transmut="|$/);
		const region = end >= 0 ? block.slice(0, end) : block;
		const multilineText = />\s*\n\s*([A-Z][a-z][^\n<{()}]{8,})\n\s*[^<\s/]/g;
		for (const match of region.matchAll(multilineText)) {
			const snippet = match[1].trim().slice(0, 60);
			issues.push(`${rel}: possible split translation key near "${snippet}…"`);
		}
	}

	return issues;
}

async function main() {
	const es = await loadJson(path.join(catalogDir, 'es.json'));
	const keys = Object.keys(es).sort();
	await syncManifest(keys);

	let errors = 0;
	for (const locale of BUNDLED) {
		const file = path.join(catalogDir, `${locale}.json`);
		try {
			const catalog = await loadJson(file);
			const catalogKeys = new Set(Object.keys(catalog));
			for (const key of keys) {
				if (!catalogKeys.has(key)) {
					console.error(`Missing key in ${locale}.json: ${key.slice(0, 80)}`);
					errors++;
				}
			}
			for (const extra of catalogKeys) {
				if (!keys.includes(extra)) {
					console.warn(`Extra key in ${locale}.json: ${extra.slice(0, 80)}`);
				}
			}
		} catch (e) {
			if (e.code === 'ENOENT') {
				console.error(`Missing bundled catalog: ${locale}.json`);
				errors++;
			} else {
				throw e;
			}
		}
	}

	const files = await walk(srcDir);
	const markupIssues = [];
	for (const file of files) {
		const content = await fs.readFile(file, 'utf-8');
		markupIssues.push(...findMarkupIssues(content, file));
	}
	for (const issue of markupIssues.slice(0, 30)) {
		console.warn(`markup: ${issue}`);
	}
	if (markupIssues.length > 30) {
		console.warn(`markup: …and ${markupIssues.length - 30} more warnings`);
	}

	if (errors > 0) {
		console.error(`check-i18n failed with ${errors} error(s)`);
		process.exit(1);
	}
	console.log(`check-i18n ok (${keys.length} keys, ${BUNDLED.length} bundled locales)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
