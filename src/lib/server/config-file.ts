import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { type AppSettings, appSettingsSchema } from '../schema/settings';

const CONFIG_FILENAME = 'dialogsys.config.json';

let writeQueue: Promise<unknown> = Promise.resolve();
let pendingClientId: string | null = null;

export function getConfigFilePath(): string {
	return path.resolve(process.cwd(), CONFIG_FILENAME);
}

export function readConfigSync(): AppSettings {
	try {
		const raw = fs.readFileSync(getConfigFilePath(), 'utf-8');
		const parsed = appSettingsSchema.parse(JSON.parse(raw));
		if (parsed.clientId) pendingClientId = parsed.clientId;
		return parsed;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
		if (e instanceof SyntaxError) return {};
		throw e;
	}
}

export async function readConfig(): Promise<AppSettings> {
	return readConfigSync();
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
	const run = writeQueue.then(fn, fn);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

async function atomicWriteConfig(data: AppSettings): Promise<void> {
	const file = getConfigFilePath();
	await fsPromises.mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
	try {
		await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
		await fsPromises.rename(tmp, file);
	} catch (e) {
		await fsPromises.unlink(tmp).catch(() => {});
		throw e;
	}
}

export async function updateConfig(
	updater: (current: AppSettings) => AppSettings,
): Promise<AppSettings> {
	return enqueueWrite(async () => {
		const current = readConfigSync();
		const next = appSettingsSchema.parse(updater(current));
		await atomicWriteConfig(next);
		if (next.clientId) pendingClientId = next.clientId;
		return next;
	});
}

export async function patchConfig(patch: Partial<AppSettings>): Promise<AppSettings> {
	return updateConfig((current) => ({ ...current, ...patch }));
}

/** Returns a stable device id; persists through a serialized config write queue. */
export function getClientId(): string {
	const config = readConfigSync();
	if (config.clientId) return config.clientId;
	if (pendingClientId) return pendingClientId;

	const clientId = randomUUID();
	pendingClientId = clientId;
	void patchConfig({ clientId });
	return clientId;
}

export async function ensureClientId(): Promise<string> {
	const config = readConfigSync();
	if (config.clientId) return config.clientId;
	if (pendingClientId) {
		await patchConfig({ clientId: pendingClientId });
		return pendingClientId;
	}
	const clientId = randomUUID();
	pendingClientId = clientId;
	await patchConfig({ clientId });
	return clientId;
}
