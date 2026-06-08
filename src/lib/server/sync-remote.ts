import fs from 'node:fs/promises';
import path from 'node:path';
import { isBinaryProjectPath } from '../portraits';
import {
	deleteOriginFile,
	ensureSyncOrigin,
	listOriginFiles,
	readOriginFile,
	writeOriginFile,
} from '../sync/client';
import { getActiveOriginId } from './client';
import { projectFilePath } from './paths';
import { getSyncCredentials } from './sync-credentials';

export async function pullActiveOrigin(slug: string, originId?: string): Promise<void> {
	const credentials = getSyncCredentials();
	const activeOrigin = originId ?? getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, activeOrigin);

	const files = await listOriginFiles(credentials, slug, activeOrigin);
	for (const file of files) {
		const res = await readOriginFile(credentials, slug, activeOrigin, file.path);
		const dest = projectFilePath(slug, ...file.path.split('/'));
		await fs.mkdir(path.dirname(dest), { recursive: true });
		if (isBinaryProjectPath(file.path)) {
			await fs.writeFile(dest, Buffer.from(res.content, 'base64'));
		} else {
			await fs.writeFile(dest, res.content, 'utf-8');
		}
	}
}

export async function pushBinaryFileToOrigin(
	slug: string,
	relPath: string,
	data: Buffer,
): Promise<void> {
	const credentials = getSyncCredentials();
	const originId = getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, originId);
	await writeOriginFile(credentials, slug, originId, relPath, data.toString('base64'));
}

export async function pushFileToOrigin(
	slug: string,
	relPath: string,
	content: string,
): Promise<void> {
	const credentials = getSyncCredentials();
	const originId = getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, originId);
	await writeOriginFile(credentials, slug, originId, relPath, content);
}

export async function removeFileFromOrigin(slug: string, relPath: string): Promise<void> {
	const credentials = getSyncCredentials();
	const originId = getActiveOriginId(slug);
	await deleteOriginFile(credentials, slug, originId, relPath);
}

export async function ensureRemoteProject(slug: string): Promise<void> {
	try {
		await fs.access(projectFilePath(slug, 'project.json'));
	} catch {
		await pullActiveOrigin(slug);
	}
}
