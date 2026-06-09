import { createHash } from 'node:crypto';
import { type CharactersFile, charactersFileSchema } from '../schema/characters';

function hashCanonicalJson(value: unknown): string {
	const json = `${JSON.stringify(value, null, 2)}\n`;
	return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** SHA-256 of canonical on-disk JSON (matches sync-server file hashing). */
export function hashCharactersFile(data: CharactersFile): string {
	return hashCanonicalJson(charactersFileSchema.parse(data));
}
