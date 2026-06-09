import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTranslationsFromDatabase } from './translations-db';

let tempDir = '';

beforeEach(async () => {
	tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dialogsys-i18n-'));
	process.env.DIALOGSYS_TRANSLATIONS_DB = path.join(tempDir, 'translations.sqlite');
	const { spawn } = await import('node:child_process');
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, ['scripts/seed-translations.mjs'], {
			cwd: process.cwd(),
			stdio: 'pipe',
			env: { ...process.env, DIALOGSYS_TRANSLATIONS_DB: process.env.DIALOGSYS_TRANSLATIONS_DB },
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`seed exited ${code ?? 'unknown'}`));
		});
	});
});

afterEach(async () => {
	delete process.env.DIALOGSYS_TRANSLATIONS_DB;
	if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

describe('loadTranslationsFromDatabase', () => {
	it('returns Spanish strings for known UI keys', async () => {
		const dbPath = process.env.DIALOGSYS_TRANSLATIONS_DB!;
		const map = await loadTranslationsFromDatabase(dbPath, 'es', ['Settings', 'Language', 'Save']);
		expect(map.Settings).toBe('Ajustes');
		expect(map.Language).toBe('Idioma');
		expect(map.Save).toBe('Guardar');
	});

	it('returns French strings for known UI keys', async () => {
		const dbPath = process.env.DIALOGSYS_TRANSLATIONS_DB!;
		const map = await loadTranslationsFromDatabase(dbPath, 'fr', [
			'Choose language',
			'Settings',
			'Save',
		]);
		expect(map.Settings).toBe('Paramètres');
		expect(map['Choose language']).toBe('Choisir la langue');
		expect(map.Save).toBe('Sauvegarder');
	});

	it('returns empty map for source locale lookups via API guard', async () => {
		const dbPath = process.env.DIALOGSYS_TRANSLATIONS_DB!;
		const map = await loadTranslationsFromDatabase(dbPath, 'en', ['Settings']);
		expect(map.Settings).toBeUndefined();
	});
});
