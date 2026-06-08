import path from 'node:path';
import { isProjectPortraitPath, portraitFileName, projectPortraitRelPath } from '../../portraits';
import { assertSafeRelative, projectFilePath } from '../paths';
import { ensureDir, fileExists, readBinaryFile, writeBinaryFile } from '../storage';
import { touchProject } from './meta';

const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const MIME_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
};

export function portraitMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	switch (ext) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		case '.gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}

export async function readPortraitFile(
	slug: string,
	relPath: string,
): Promise<{ data: Buffer; mime: string }> {
	if (!isProjectPortraitPath(relPath)) {
		throw new Error('Invalid portrait path');
	}
	const name = portraitFileName(relPath);
	if (!name) throw new Error('Invalid portrait path');
	assertSafeRelative(name);
	const data = await readBinaryFile(slug, 'portraits', name);
	return { data, mime: portraitMimeType(name) };
}

export async function savePortraitUpload(
	slug: string,
	characterId: string,
	stateId: string,
	file: File,
): Promise<{ path: string }> {
	if (!/^[a-z][a-z0-9_]*$/.test(characterId) || !/^[a-z][a-z0-9_]*$/.test(stateId)) {
		throw new Error('Invalid character or state id');
	}
	if (!ALLOWED_MIME.has(file.type)) {
		throw new Error('Portrait must be PNG, JPEG, WebP, or GIF');
	}
	if (file.size > MAX_PORTRAIT_BYTES) {
		throw new Error('Portrait must be 5 MB or smaller');
	}

	const ext = MIME_EXT[file.type] ?? 'png';
	const relPath = projectPortraitRelPath(characterId, stateId, ext);
	const name = portraitFileName(relPath)!;
	const bytes = Buffer.from(await file.arrayBuffer());

	await ensureDir(slug, 'portraits');
	await writeBinaryFile(slug, ['portraits', name], bytes);
	await touchProject(slug);

	return { path: relPath };
}

export async function portraitExists(slug: string, relPath: string): Promise<boolean> {
	if (!isProjectPortraitPath(relPath)) return false;
	const name = portraitFileName(relPath);
	if (!name) return false;
	return fileExists(slug, 'portraits', name);
}

export function resolvePortraitDiskPath(slug: string, relPath: string): string {
	if (!isProjectPortraitPath(relPath)) {
		throw new Error('Invalid portrait path');
	}
	const name = portraitFileName(relPath)!;
	return projectFilePath(slug, 'portraits', name);
}
