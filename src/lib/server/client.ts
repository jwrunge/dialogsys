import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { type AppSettings, appSettingsSchema } from '../schema/settings';
import { getConfigFilePath } from './settings';

function readConfig(): AppSettings {
	try {
		const raw = fs.readFileSync(getConfigFilePath(), 'utf-8');
		return appSettingsSchema.parse(JSON.parse(raw));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
		if (e instanceof SyntaxError) return {};
		throw e;
	}
}

async function writeConfig(patch: Partial<AppSettings>): Promise<AppSettings> {
	const current = readConfig();
	const next = { ...current, ...patch };
	const file = getConfigFilePath();
	const tmp = `${file}.${Date.now()}.tmp`;
	await fsPromises.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf-8');
	await fsPromises.rename(tmp, file);
	return next;
}

export function getClientId(): string {
	const config = readConfig();
	if (config.clientId) return config.clientId;
	const clientId = randomUUID();
	void writeConfig({ clientId });
	return clientId;
}

export async function ensureClientId(): Promise<string> {
	const config = readConfig();
	if (config.clientId) return config.clientId;
	const clientId = randomUUID();
	await writeConfig({ clientId });
	return clientId;
}

export function getActiveOriginId(slug: string): string {
	const config = readConfig();
	return config.activeOrigins?.[slug] ?? getClientId();
}

export async function setActiveOriginId(slug: string, originId: string): Promise<void> {
	const config = readConfig();
	const activeOrigins = { ...config.activeOrigins, [slug]: originId };
	await writeConfig({ activeOrigins });
}

export function getOriginLabel(originId: string): string | undefined {
	return readConfig().originLabels?.[originId];
}

export async function setOriginLabel(originId: string, label: string): Promise<void> {
	const config = readConfig();
	const originLabels = { ...config.originLabels, [originId]: label.trim() };
	await writeConfig({ originLabels });
}
