import { assertSafeRelative } from '../paths';
import { readTextFile, writeTextFile } from '../storage';
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

export async function writeNote(slug: string, notePath: string, content: string): Promise<void> {
	assertSafeRelative(notePath);
	assertMarkdownNote(notePath);
	await writeTextFile(slug, ['notes', notePath], content);
	await touchProject(slug);
}
