import fs from 'node:fs/promises';
import path from 'node:path';
import { projectFilePath } from '../server/paths';

export type SyncManifest = {
	originId: string;
	files: Record<string, string>;
	updatedAt: string;
};

function manifestPath(slug: string): string {
	return projectFilePath(slug, '.dialogsys', 'sync-manifest.json');
}

export async function readSyncManifest(slug: string): Promise<SyncManifest | null> {
	try {
		const raw = await fs.readFile(manifestPath(slug), 'utf-8');
		return JSON.parse(raw) as SyncManifest;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
}

export async function writeSyncManifest(slug: string, manifest: SyncManifest): Promise<void> {
	const file = manifestPath(slug);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

export async function getTrackedHash(slug: string, relPath: string): Promise<string | undefined> {
	const manifest = await readSyncManifest(slug);
	return manifest?.files[relPath];
}

export async function setTrackedHash(
	slug: string,
	originId: string,
	relPath: string,
	contentHash: string,
): Promise<void> {
	const manifest = (await readSyncManifest(slug)) ?? {
		originId,
		files: {},
		updatedAt: new Date().toISOString(),
	};
	manifest.originId = originId;
	manifest.files[relPath] = contentHash;
	manifest.updatedAt = new Date().toISOString();
	await writeSyncManifest(slug, manifest);
}

export async function replaceManifestFromFiles(
	slug: string,
	originId: string,
	files: Array<{ path: string; contentHash: string }>,
): Promise<void> {
	const manifest: SyncManifest = {
		originId,
		files: Object.fromEntries(files.map((file) => [file.path, file.contentHash])),
		updatedAt: new Date().toISOString(),
	};
	await writeSyncManifest(slug, manifest);
}
