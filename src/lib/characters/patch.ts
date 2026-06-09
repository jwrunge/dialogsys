import type { Character, CharactersFile } from '../schema/characters';
import type { CharactersPatchOp } from '../schema/characters-patch';

function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

export function computeCharactersPatch(base: CharactersFile, next: CharactersFile): CharactersPatchOp[] {
	const ops: CharactersPatchOp[] = [];

	const baseChars = new Map(base.characters.map((character) => [character.id, character]));
	const nextChars = new Map(next.characters.map((character) => [character.id, character]));

	for (const [id, character] of nextChars) {
		const previous = baseChars.get(id);
		if (!previous || stableJson(previous) !== stableJson(character)) {
			ops.push({ op: 'upsertCharacter', character });
		}
	}
	for (const id of baseChars.keys()) {
		if (!nextChars.has(id)) {
			ops.push({ op: 'removeCharacter', characterId: id });
		}
	}

	return ops;
}

export function applyCharactersPatchOps(data: CharactersFile, ops: CharactersPatchOp[]): CharactersFile {
	let characters: Character[] = [...data.characters];

	for (const op of ops) {
		switch (op.op) {
			case 'upsertCharacter': {
				const index = characters.findIndex((character) => character.id === op.character.id);
				if (index >= 0) characters[index] = op.character;
				else characters = [...characters, op.character];
				break;
			}
			case 'removeCharacter':
				characters = characters.filter((character) => character.id !== op.characterId);
				break;
		}
	}

	return { characters };
}
