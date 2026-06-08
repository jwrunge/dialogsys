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
import { SyncConflictError } from '../sync/errors';
import { replaceManifestFromFiles, setTrackedHash } from '../sync/manifest';
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

	await replaceManifestFromFiles(
		slug,
		activeOrigin,
		files.map((file) => ({ path: file.path, contentHash: file.contentHash })),
	);
}

export async function pullOriginFile(
	slug: string,
	relPath: string,
	originId?: string,
): Promise<void> {
	const credentials = getSyncCredentials();
	const activeOrigin = originId ?? getActiveOriginId(slug);
	const res = await readOriginFile(credentials, slug, activeOrigin, relPath);
	const dest = projectFilePath(slug, ...relPath.split('/'));
	await fs.mkdir(path.dirname(dest), { recursive: true });
	if (isBinaryProjectPath(relPath)) {
		await fs.writeFile(dest, Buffer.from(res.content, 'base64'));
	} else {
		await fs.writeFile(dest, res.content, 'utf-8');
	}
	await setTrackedHash(slug, activeOrigin, relPath, res.contentHash);
}

export async function pushBinaryFileToOrigin(
	slug: string,
	relPath: string,
	data: Buffer,
	options?: { force?: boolean },
): Promise<void> {
	const credentials = getSyncCredentials();
	const originId = getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, originId);
	const { getTrackedHash } = await import('../sync/manifest');
	const previousHash = options?.force ? undefined : await getTrackedHash(slug, relPath);
	try {
		const result = await writeOriginFile(
			credentials,
			slug,
			originId,
			relPath,
			data.toString('base64'),
			previousHash,
		);
		await setTrackedHash(slug, originId, relPath, result.contentHash);
	} catch (error) {
		if (error instanceof SyncConflictError) {
			throw new SyncConflictError(error.message, relPath, previousHash);
		}
		throw error;
	}
}

export async function pushFileToOrigin(
	slug: string,
	relPath: string,
	content: string,
	options?: { force?: boolean },
): Promise<void> {
	const credentials = getSyncCredentials();
	const originId = getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, originId);
	const { getTrackedHash } = await import('../sync/manifest');
	const previousHash = options?.force ? undefined : await getTrackedHash(slug, relPath);
	try {
		const result = await writeOriginFile(
			credentials,
			slug,
			originId,
			relPath,
			content,
			previousHash,
		);
		await setTrackedHash(slug, originId, relPath, result.contentHash);
	} catch (error) {
		if (error instanceof SyncConflictError) {
			throw new SyncConflictError(error.message, relPath, previousHash);
		}
		throw error;
	}
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
