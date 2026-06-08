import { type CharactersFile, charactersFileSchema } from '../../schema/characters';
import { readJsonFile, writeJsonFile } from '../storage';
import { touchProject } from './meta';

export async function getCharacters(slug: string): Promise<CharactersFile> {
	const raw = await readJsonFile(slug, ['characters.json'], { characters: [] });
	return charactersFileSchema.parse(raw);
}

export async function saveCharacters(slug: string, data: CharactersFile): Promise<CharactersFile> {
	const parsed = charactersFileSchema.parse(data);
	await writeJsonFile(slug, ['characters.json'], parsed);
	await touchProject(slug);
	return parsed;
}
