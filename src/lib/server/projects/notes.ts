import { hashNoteContent } from '../../notes/content-hash';
import { applyNotePatchOps } from '../../notes/patch';
import type { NotePatchOp } from '../../schema/note-patch';
import { getActiveOriginId } from '../client';
import { publishGraphPatch } from '../collaboration/realtime-publish';
import { getClientId } from '../config-file';
import { assertSafeRelative } from '../paths';
import { getDeviceDisplayName } from '../settings';
import { readTextFile, writeTextFile } from '../storage';
import { GraphPatchConflictError } from './dialogs';
import { touchProject } from './meta';

function assertMarkdownNote(notePath: string): void {
	if (!notePath.endsWith('.md')) {
		throw new Error('Notes must be .md files');
	}
}

export async function readNote(slug: string, notePath: string): Promise<string> {
	assertSafeRelative(notePath);
	assertMarkdownNote(notePath);
	return readTextFile(slug, 'notes', notePath);
}

export async function readNoteWithHash(
	slug: string,
	notePath: string,
): Promise<{ path: string; content: string; contentHash: string }> {
	const content = await readNote(slug, notePath);
	return { path: notePath, content, contentHash: hashNoteContent(content) };
}

export async function writeNote(slug: string, notePath: string, content: string): Promise<void> {
	assertSafeRelative(notePath);
	assertMarkdownNote(notePath);
	await writeTextFile(slug, ['notes', notePath], content);
	await touchProject(slug);
}

export async function applyNotePatch(
	slug: string,
	notePath: string,
	baseContentHash: string,
	ops: NotePatchOp[],
): Promise<{ path: string; content: string; contentHash: string }> {
	assertSafeRelative(notePath);
	assertMarkdownNote(notePath);

	const current = await readNote(slug, notePath);
	const currentHash = hashNoteContent(current);
	if (baseContentHash !== currentHash) {
		throw new GraphPatchConflictError(
			'Note changed since baseContentHash',
			currentHash,
			undefined,
			undefined,
			current,
			undefined,
			`notes/${notePath}`,
		);
	}

	const patched = applyNotePatchOps(current, ops);
	await writeNote(slug, notePath, patched);
	const contentHash = hashNoteContent(patched);

	await publishGraphPatch(slug, {
		deviceId: getClientId(),
		displayName: getDeviceDisplayName() || 'This device',
		originId: getActiveOriginId(slug),
		path: `notes/${notePath}`,
		baseContentHash,
		contentHash,
		ops,
	});

	return { path: notePath, content: patched, contentHash };
}
