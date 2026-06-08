import { portraitPathForPreview } from './portraits';
import type { Character, CharacterState } from './schema/characters';

export function getStateIds(character: Character): Set<string> {
	return new Set(character.states.map((s) => s.id));
}

export function getState(
	character: Character,
	stateId: string | undefined,
): CharacterState | undefined {
	if (!stateId) {
		return character.states.find((s) => s.id === character.defaultStateId);
	}
	return character.states.find((s) => s.id === stateId);
}

export function resolvePortraitPath(
	character: Character | undefined,
	stateId: string | undefined,
	override?: string,
): string {
	if (override?.trim()) return override.trim();
	if (!character) return '';
	const state = getState(character, stateId);
	return state?.portraitPath ?? character.portraitPath ?? '';
}

/** Browser-loadable portrait URL, or null when no preview is available. */
export function portraitPreviewUrl(slug: string, path: string | undefined): string | null {
	return portraitPathForPreview(slug, path);
}

export function defaultPortraitPath(character: Character): string {
	return resolvePortraitPath(character, character.defaultStateId);
}

export function characterById(
	characters: Character[],
	id: string | undefined,
): Character | undefined {
	if (!id) return undefined;
	return characters.find((c) => c.id === id);
}
