import { applyCharactersPatchOps } from '../../characters/patch';
import { hashCharactersFile } from '../../characters/content-hash';
import { type CharactersFile, charactersFileSchema } from '../../schema/characters';
import type { CharactersPatchOp } from '../../schema/characters-patch';
import { getActiveOriginId } from '../client';
import { publishGraphPatch } from '../collaboration/realtime-publish';
import { getClientId } from '../config-file';
import { getDeviceDisplayName } from '../settings';
import { readJsonFile, writeJsonFile } from '../storage';
import { GraphPatchConflictError } from './dialogs';
import { touchProject } from './meta';

export async function getCharacters(slug: string): Promise<CharactersFile> {
	const raw = await readJsonFile(slug, ['characters.json'], { characters: [] });
	return charactersFileSchema.parse(raw);
}

export async function getCharactersWithHash(
	slug: string,
): Promise<{ characters: CharactersFile; contentHash: string }> {
	const characters = await getCharacters(slug);
	return { characters, contentHash: hashCharactersFile(characters) };
}

export async function saveCharacters(slug: string, data: CharactersFile): Promise<CharactersFile> {
	const parsed = charactersFileSchema.parse(data);
	await writeJsonFile(slug, ['characters.json'], parsed);
	await touchProject(slug);
	return parsed;
}

export async function applyCharactersPatch(
	slug: string,
	baseContentHash: string,
	ops: CharactersPatchOp[],
): Promise<{ characters: CharactersFile; contentHash: string }> {
	const current = await getCharacters(slug);
	const currentHash = hashCharactersFile(current);
	if (baseContentHash !== currentHash) {
		throw new GraphPatchConflictError(
			'Characters changed since baseContentHash',
			currentHash,
			undefined,
			current,
		);
	}

	const patched = charactersFileSchema.parse(applyCharactersPatchOps(current, ops));
	const saved = await saveCharacters(slug, patched);
	const contentHash = hashCharactersFile(saved);

	await publishGraphPatch(slug, {
		deviceId: getClientId(),
		displayName: getDeviceDisplayName() || 'This device',
		originId: getActiveOriginId(slug),
		path: 'characters.json',
		baseContentHash,
		contentHash,
		ops,
	});

	return { characters: saved, contentHash };
}
