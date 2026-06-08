import fs from 'node:fs';
import path from 'node:path';
import type { GetTransMapFn } from '@jwrunge/transmut/observer/types';
import { parseLocaleTag, resolveLocaleTag, SOURCE_LOCALE } from '../i18n/locales';
import { getConfiguredLocale } from './settings';
import { createDatabaseTranslationProvider } from './translations-db';

const DEFAULT_DB = path.resolve(process.cwd(), 'i18n/translations.sqlite');

let provider: GetTransMapFn | null = null;
let seedPromise: Promise<void> | null = null;

export function getTranslationsDatabasePath(): string {
	const configured = process.env.DIALOGSYS_TRANSLATIONS_DB?.trim();
	return configured ? path.resolve(configured) : DEFAULT_DB;
}

function databaseExists(): boolean {
	try {
		fs.accessSync(getTranslationsDatabasePath(), fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function seedTranslationsIfNeeded(): Promise<void> {
	if (databaseExists()) return;
	const script = path.resolve(process.cwd(), 'scripts/seed-translations.mjs');
	const { spawn } = await import('node:child_process');
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [script], {
			cwd: process.cwd(),
			stdio: 'inherit',
			env: { ...process.env, DIALOGSYS_TRANSLATIONS_DB: getTranslationsDatabasePath() },
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`seed-translations exited with code ${code ?? 'unknown'}`));
		});
	});
}

export async function ensureTranslationsReady(): Promise<void> {
	if (!seedPromise) {
		seedPromise = seedTranslationsIfNeeded();
	}
	await seedPromise;
}

export function getTranslationProvider(): GetTransMapFn {
	if (!provider) {
		provider = createDatabaseTranslationProvider(getTranslationsDatabasePath());
	}
	return provider;
}

export function getConfiguredLocaleTag(): string | undefined {
	return getConfiguredLocale();
}

export function getResolvedLocaleTag(browserLocale?: string): string {
	return resolveLocaleTag(getConfiguredLocaleTag(), browserLocale);
}

export function getHtmlLangAttribute(localeTag?: string): string {
	const tag = localeTag ?? getResolvedLocaleTag();
	return parseLocaleTag(tag).tag;
}

export function shouldTranslateTo(localeTag: string): boolean {
	return parseLocaleTag(localeTag).langCode !== SOURCE_LOCALE;
}
