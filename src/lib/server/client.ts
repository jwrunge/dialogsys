import { getClientId, patchConfig, readConfigSync } from './config-file';

export { ensureClientId, getClientId } from './config-file';

export function getActiveOriginId(slug: string): string {
	const config = readConfigSync();
	return config.activeOrigins?.[slug] ?? getClientId();
}

export async function setActiveOriginId(slug: string, originId: string): Promise<void> {
	const config = readConfigSync();
	const activeOrigins = { ...config.activeOrigins, [slug]: originId };
	await patchConfig({ activeOrigins });
}

export function getOriginLabel(originId: string): string | undefined {
	return readConfigSync().originLabels?.[originId];
}

export async function setOriginLabel(originId: string, label: string): Promise<void> {
	const config = readConfigSync();
	const originLabels = { ...config.originLabels, [originId]: label.trim() };
	await patchConfig({ originLabels });
}
