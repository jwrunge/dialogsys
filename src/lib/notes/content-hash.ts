import { createHash } from 'node:crypto';

/** SHA-256 of raw note bytes as stored on disk (matches sync-server file hashing). */
export function hashNoteContent(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}
