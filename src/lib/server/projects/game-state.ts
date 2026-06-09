import { hashGameStateFile } from '../../game-state/content-hash';
import { applyGameStatePatchOps } from '../../game-state/patch';
import {
	type GameStateFile,
	gameStateFileSchema,
	normalizeGameStateFile,
} from '../../schema/gameState';
import type { GameStatePatchOp } from '../../schema/game-state-patch';
import { getActiveOriginId } from '../client';
import { publishGraphPatch } from '../collaboration/realtime-publish';
import { getClientId } from '../config-file';
import { getDeviceDisplayName } from '../settings';
import { readJsonFile, writeJsonFile } from '../storage';
import { GraphPatchConflictError } from './dialogs';
import { touchProject } from './meta';

export async function getGameState(slug: string): Promise<GameStateFile> {
	const raw = await readJsonFile(slug, ['gameState.json'], { properties: [] });
	return normalizeGameStateFile(gameStateFileSchema.parse(raw));
}

export async function getGameStateWithHash(
	slug: string,
): Promise<{ gameState: GameStateFile; contentHash: string }> {
	const gameState = await getGameState(slug);
	return { gameState, contentHash: hashGameStateFile(gameState) };
}

export async function saveGameState(slug: string, data: GameStateFile): Promise<GameStateFile> {
	const parsed = normalizeGameStateFile(gameStateFileSchema.parse(data));
	await writeJsonFile(slug, ['gameState.json'], parsed);
	await touchProject(slug);
	return parsed;
}

export async function applyGameStatePatch(
	slug: string,
	baseContentHash: string,
	ops: GameStatePatchOp[],
): Promise<{ gameState: GameStateFile; contentHash: string }> {
	const current = await getGameState(slug);
	const currentHash = hashGameStateFile(current);
	if (baseContentHash !== currentHash) {
		throw new GraphPatchConflictError(
			'Game state changed since baseContentHash',
			currentHash,
			undefined,
			undefined,
			undefined,
			current,
		);
	}

	const patched = normalizeGameStateFile(applyGameStatePatchOps(current, ops));
	const saved = await saveGameState(slug, patched);
	const contentHash = hashGameStateFile(saved);

	await publishGraphPatch(slug, {
		deviceId: getClientId(),
		displayName: getDeviceDisplayName() || 'This device',
		originId: getActiveOriginId(slug),
		path: 'gameState.json',
		baseContentHash,
		contentHash,
		ops,
	});

	return { gameState: saved, contentHash };
}
