import { createHash } from 'node:crypto';
import {
	type GameStateFile,
	gameStateFileSchema,
	normalizeGameStateFile,
} from '../schema/gameState';

function hashCanonicalJson(value: unknown): string {
	const json = `${JSON.stringify(value, null, 2)}\n`;
	return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** SHA-256 of canonical on-disk JSON (matches sync-server file hashing). */
export function hashGameStateFile(data: GameStateFile): string {
	return hashCanonicalJson(normalizeGameStateFile(gameStateFileSchema.parse(data)));
}
