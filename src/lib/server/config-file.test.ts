import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config-file write queue', () => {
	let tmpDir: string;
	let previousCwd: string;

	beforeEach(async () => {
		previousCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dialogsys-config-'));
		process.chdir(tmpDir);
	});

	afterEach(async () => {
		process.chdir(previousCwd);
		await fs.rm(tmpDir, { recursive: true, force: true });
		vi.resetModules();
	});

	it('serializes concurrent patches without losing fields', async () => {
		const { patchConfig, readConfigSync } = await import('./config-file');

		await Promise.all([
			patchConfig({ locale: 'es' }),
			patchConfig({ deviceDisplayName: 'Test Device' }),
		]);

		const config = readConfigSync();
		expect(config.locale).toBe('es');
		expect(config.deviceDisplayName).toBe('Test Device');
	});
});
