import path from 'node:path';
import { getProjectsRoot } from './settings';

export function assertSafeSlug(slug: string): void {
	if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
		throw new Error('Invalid project slug');
	}
}

function assertSafeRelative(rel: string): void {
	const normalized = path.normalize(rel);
	if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
		throw new Error('Invalid path');
	}
}

export function projectDir(slug: string): string {
	assertSafeSlug(slug);
	const dir = path.resolve(getProjectsRoot(), slug);
	const root = path.resolve(getProjectsRoot());
	if (!dir.startsWith(root + path.sep) && dir !== root) {
		throw new Error('Path traversal denied');
	}
	return dir;
}

export function projectFilePath(slug: string, ...segments: string[]): string {
	segments.forEach(assertSafeRelative);
	const dir = projectDir(slug);
	const file = path.resolve(dir, ...segments);
	if (!file.startsWith(dir + path.sep) && file !== dir) {
		throw new Error('Path traversal denied');
	}
	return file;
}
