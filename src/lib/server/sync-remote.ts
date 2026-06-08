import fs from 'node:fs/promises';
import path from 'node:path';
import {
	ensureSyncOrigin,
	listOriginFiles,
	readOriginFile,
	writeOriginFile,
	deleteOriginFile,
} from '../sync/client';
import { getActiveOriginId } from './client';
import { getAppSettingsInfo } from './settings';
import { projectFilePath } from './paths';

function syncBaseUrl(): string {
	const { syncServerUrl } = getAppSettingsInfo();
	if (!syncServerUrl) throw new Error('Sync server URL is not configured');
	return syncServerUrl;
}

export async function pullActiveOrigin(slug: string, originId?: string): Promise<void> {
	const baseUrl = syncBaseUrl();
	const activeOrigin = originId ?? getActiveOriginId(slug);
	await ensureSyncOrigin(baseUrl, slug, activeOrigin);

	const files = await listOriginFiles(baseUrl, slug, activeOrigin);
	for (const file of files) {
		const res = await readOriginFile(baseUrl, slug, activeOrigin, file.path);
		const dest = projectFilePath(slug, ...file.path.split('/'));
		await fs.mkdir(path.dirname(dest), { recursive: true });
		await fs.writeFile(dest, res.content, 'utf-8');
	}
}

export async function pushFileToOrigin(
	slug: string,
	relPath: string,
	content: string,
): Promise<void> {
	const baseUrl = syncBaseUrl();
	const originId = getActiveOriginId(slug);
	await ensureSyncOrigin(baseUrl, slug, originId);
	await writeOriginFile(baseUrl, slug, originId, relPath, content);
}

export async function removeFileFromOrigin(slug: string, relPath: string): Promise<void> {
	const baseUrl = syncBaseUrl();
	const originId = getActiveOriginId(slug);
	await deleteOriginFile(baseUrl, slug, originId, relPath);
}

export async function ensureRemoteProject(slug: string): Promise<void> {
	try {
		await fs.access(projectFilePath(slug, 'project.json'));
	} catch {
		await pullActiveOrigin(slug);
	}
}
