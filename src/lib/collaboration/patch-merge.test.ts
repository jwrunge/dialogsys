import { describe, expect, it } from 'vitest';
import type { CharactersFile } from '../schema/characters';
import type { DialogGraph } from '../schema/graph';
import type { CoauthorGraphPatch } from '../sync/realtime';
import { applyCharactersPatchWithMerge, applyScenePatchWithMerge } from './patch-merge';

function patch(
	ops: CoauthorGraphPatch['ops'],
	baseContentHash: string,
	contentHash: string,
): CoauthorGraphPatch {
	return {
		path: 'test',
		ops,
		baseContentHash,
		contentHash,
		deviceId: 'remote',
		displayName: 'Remote',
		originId: '00000000-0000-4000-8000-000000000001',
	};
}

const sampleCharacter = {
	id: 'hero',
	displayName: 'Hero',
	bio: '',
	portraitPath: '',
	tags: [] as string[],
	voiceNotes: '',
	defaultStateId: 'default',
	states: [{ id: 'default', label: 'Default', portraitPath: '', optOutUnusedWarning: false }],
};

describe('applyScenePatchWithMerge', () => {
	const ancestor: DialogGraph = {
		id: 'scene',
		displayName: 'Scene',
		description: '',
		nodes: [
			{ id: 'line1', type: 'line', position: { x: 0, y: 0 }, data: { text: 'A', speaker: 'x' } },
			{ id: 'line2', type: 'line', position: { x: 1, y: 0 }, data: { text: 'B', speaker: 'y' } },
		],
		edges: [],
		updatedAt: '2026-01-01T00:00:00.000Z',
	};

	it('merges non-overlapping node edits when base is stale', () => {
		const local: DialogGraph = {
			...ancestor,
			nodes: ancestor.nodes.map((node) =>
				node.id === 'line1' ? { ...node, data: { ...node.data, text: 'Local' } } : node,
			),
		};
		const remotePatch = patch(
			[
				{
					op: 'upsertNode',
					node: {
						...ancestor.nodes[1]!,
						data: { ...ancestor.nodes[1]!.data, text: 'Remote' },
					},
				},
			],
			'old-hash',
			'new-hash',
		);

		const { value, staleBase } = applyScenePatchWithMerge(ancestor, local, remotePatch, 'current-hash');
		expect(staleBase).toBe(true);
		expect(value.nodes.find((n) => n.id === 'line1')?.data.text).toBe('Local');
		expect(value.nodes.find((n) => n.id === 'line2')?.data.text).toBe('Remote');
	});

	it('applies remote directly when base matches', () => {
		const local = ancestor;
		const remotePatch = patch(
			[{ op: 'updateMeta', displayName: 'Renamed' }],
			'hash-a',
			'hash-b',
		);

		const { value, staleBase } = applyScenePatchWithMerge(ancestor, local, remotePatch, 'hash-a');
		expect(staleBase).toBe(false);
		expect(value.displayName).toBe('Renamed');
	});
});

describe('applyCharactersPatchWithMerge', () => {
	const ancestor: CharactersFile = {
		characters: [
			sampleCharacter,
			{ ...sampleCharacter, id: 'npc', displayName: 'NPC' },
		],
	};

	it('merges character field edits independently', () => {
		const local: CharactersFile = {
			characters: ancestor.characters.map((c) =>
				c.id === 'hero' ? { ...c, displayName: 'Hero Local' } : c,
			),
		};
		const remotePatch = patch(
			[
				{
					op: 'upsertCharacter',
					character: { ...ancestor.characters[1]!, displayName: 'NPC Remote' },
				},
			],
			'old',
			'new',
		);

		const { value, staleBase } = applyCharactersPatchWithMerge(ancestor, local, remotePatch, 'current');
		expect(staleBase).toBe(true);
		expect(value.characters.find((c) => c.id === 'hero')?.displayName).toBe('Hero Local');
		expect(value.characters.find((c) => c.id === 'npc')?.displayName).toBe('NPC Remote');
	});
});
