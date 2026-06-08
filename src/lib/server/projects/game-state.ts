import {
	type GameStateFile,
	gameStateFileSchema,
	normalizeGameStateFile,
} from '../../schema/gameState';
import { readJsonFile, writeJsonFile } from '../storage';
import { touchProject } from './meta';

export async function getGameState(slug: string): Promise<GameStateFile> {
	const raw = await readJsonFile(slug, ['gameState.json'], { properties: [] });
	return normalizeGameStateFile(gameStateFileSchema.parse(raw));
}

export async function saveGameState(slug: string, data: GameStateFile): Promise<GameStateFile> {
	const parsed = normalizeGameStateFile(gameStateFileSchema.parse(data));
	await writeJsonFile(slug, ['gameState.json'], parsed);
	await touchProject(slug);
	return parsed;
}
