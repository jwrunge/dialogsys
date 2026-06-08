import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppSettingsInfo } from './settings';
import { projectFilePath } from './paths';
import {
	ensureRemoteProject,
	pullActiveOrigin,
	pushFileToOrigin,
	removeFileFromOrigin,
} from './sync-remote';

export function isRemoteStorage(): boolean {
	return getAppSettingsInfo().storageMode === 'remote';
}

export async function ensureProjectReady(slug: string): Promise<void> {
	if (isRemoteStorage()) {
		await ensureRemoteProject(slug);
	}
}

export async function switchOrigin(slug: string, originId: string): Promise<void> {
	if (!isRemoteStorage()) {
		throw new Error('Origin switching requires remote storage');
	}
	await pullActiveOrigin(slug, originId);
}

export async function readTextFile(slug: string, ...segments: string[]): Promise<string> {
	await ensureProjectReady(slug);
	const file = projectFilePath(slug, ...segments);
	try {
		return await fs.readFile(file, 'utf-8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return '';
		throw e;
	}
}

export async function writeTextFile(
	slug: string,
	segments: string[],
	content: string,
): Promise<void> {
	await ensureProjectReady(slug);
	const file = projectFilePath(slug, ...segments);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content, 'utf-8');
	if (isRemoteStorage()) {
		await pushFileToOrigin(slug, segments.join('/'), content);
	}
}

export async function writeJsonFile(slug: string, segments: string[], data: unknown): Promise<void> {
	const content = JSON.stringify(data, null, 2) + '\n';
	await writeTextFile(slug, segments, content);
}

export async function readJsonFile<T>(slug: string, segments: string[], fallback: T): Promise<T> {
	const file = projectFilePath(slug, ...segments);
	await ensureProjectReady(slug);
	try {
		const raw = await fs.readFile(file, 'utf-8');
		return JSON.parse(raw) as T;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
		throw e;
	}
}

export async function ensureDir(slug: string, ...segments: string[]): Promise<void> {
	await ensureProjectReady(slug);
	await fs.mkdir(projectFilePath(slug, ...segments), { recursive: true });
}

export async function listDir(slug: string, ...segments: string[]): Promise<string[]> {
	await ensureDir(slug, ...segments);
	const dir = projectFilePath(slug, ...segments);
	return fs.readdir(dir);
}

export async function fileExists(slug: string, ...segments: string[]): Promise<boolean> {
	await ensureProjectReady(slug);
	try {
		await fs.access(projectFilePath(slug, ...segments));
		return true;
	} catch {
		return false;
	}
}

export async function deleteFile(slug: string, ...segments: string[]): Promise<void> {
	await ensureProjectReady(slug);
	const file = projectFilePath(slug, ...segments);
	await fs.unlink(file);
	if (isRemoteStorage()) {
		await removeFileFromOrigin(slug, segments.join('/'));
	}
}
