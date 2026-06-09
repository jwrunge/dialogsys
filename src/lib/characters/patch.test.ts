import { describe, expect, it } from 'vitest';
import type { CharactersFile } from '../schema/characters';
import { hashCharactersFile } from './content-hash';
import { applyCharactersPatchOps, computeCharactersPatch } from './patch';

const base: CharactersFile = {
	characters: [
		{
			id: 'bartender',
			displayName: 'Bartender',
			bio: 'Runs the tavern.',
			portraitPath: '',
			tags: ['npc'],
			voiceNotes: '',
			defaultStateId: 'default',
			states: [{ id: 'default', label: 'Default', portraitPath: '', optOutUnusedWarning: false }],
		},
	],
};

describe('characters patch', () => {
	it('diffs and applies display name updates', () => {
		const next: CharactersFile = {
			characters: base.characters.map((character) =>
				character.id === 'bartender'
					? { ...character, displayName: 'Innkeeper' }
					: character,
			),
		};
		const ops = computeCharactersPatch(base, next);
		expect(ops).toHaveLength(1);
		expect(ops[0]?.op).toBe('upsertCharacter');
		const applied = applyCharactersPatchOps(base, ops);
		expect(applied.characters[0]?.displayName).toBe('Innkeeper');
	});

	it('content hash changes when characters change', () => {
		const next = applyCharactersPatchOps(base, [
			{
				op: 'upsertCharacter',
				character: { ...base.characters[0]!, displayName: 'Innkeeper' },
			},
		]);
		expect(hashCharactersFile(next)).not.toBe(hashCharactersFile(base));
	});
});
