import { nanoid } from 'nanoid';
import type { Character, CharacterState } from '../schema/characters';

export function cloneCharacter(char: Character): Character {
	return JSON.parse(JSON.stringify(char)) as Character;
}

export function cloneState(state: CharacterState): CharacterState {
	return JSON.parse(JSON.stringify(state)) as CharacterState;
}

export function newCharacter(): Character {
	const id = `char_${nanoid(6)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')}`;
	return {
		id,
		displayName: 'New Character',
		bio: '',
		portraitPath: '',
		tags: [],
		voiceNotes: '',
		defaultStateId: 'default',
		states: [
			{
				id: 'default',
				label: 'Default',
				portraitPath: '',
				optOutUnusedWarning: false,
			},
		],
	};
}

export function newState(): CharacterState {
	return {
		id: `state_${nanoid(4)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')}`,
		label: 'New State',
		portraitPath: '',
		optOutUnusedWarning: false,
	};
}

export function slugifyStateLabel(label: string): string {
	return (
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '')
			.slice(0, 32) || 'state'
	);
}
