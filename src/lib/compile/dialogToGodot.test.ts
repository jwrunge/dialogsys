import { describe, expect, it } from 'vitest';
import type { Character } from '../schema/characters';
import type { DialogGraph } from '../schema/graph';
import { compileDialogToGodot } from './dialogToGodot';

const characters: Character[] = [
	{
		id: 'bartender',
		displayName: 'Barkeep',
		bio: '',
		portraitPath: '',
		tags: [],
		voiceNotes: '',
		defaultStateId: 'neutral',
		states: [
			{
				id: 'neutral',
				label: 'Neutral',
				portraitPath: 'portraits/bartender_neutral.png',
				optOutUnusedWarning: false,
			},
		],
	},
];

function linearGraph(): DialogGraph {
	return {
		id: 'tavern_intro',
		displayName: 'Tavern Intro',
		description: '',
		nodes: [
			{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
			{
				id: 'line1',
				type: 'line',
				position: { x: 100, y: 0 },
				data: { speaker: 'bartender', text: 'Hello!', characterState: 'neutral' },
			},
			{ id: 'end', type: 'end', position: { x: 200, y: 0 }, data: {} },
		],
		edges: [
			{ id: 'e1', source: 'entry', target: 'line1' },
			{ id: 'e2', source: 'line1', target: 'end' },
		],
	};
}

describe('compileDialogToGodot', () => {
	it('compiles a linear line graph with start and portrait path', () => {
		const result = compileDialogToGodot(linearGraph(), characters, (p) => `res://${p}`);
		expect(result.id).toBe('tavern_intro');
		expect(result.start).toBe('line1');
		expect(result.nodes.line1).toMatchObject({
			type: 'line',
			speaker: 'bartender',
			text: 'Hello!',
			next: 'end',
			portraitPath: 'res://portraits/bartender_neutral.png',
		});
		expect(result.nodes.end).toEqual({ type: 'end' });
	});

	it('compiles choice nodes with option branches', () => {
		const graph: DialogGraph = {
			...linearGraph(),
			nodes: [
				{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
				{
					id: 'choice1',
					type: 'choice',
					position: { x: 100, y: 0 },
					data: {
						options: [
							{ id: 'yes', text: 'Yes', conditions: [] },
							{ id: 'no', text: 'No', conditions: [] },
						],
					},
				},
				{ id: 'yes_line', type: 'line', position: { x: 200, y: 0 }, data: { text: 'Yes path' } },
				{ id: 'end', type: 'end', position: { x: 300, y: 0 }, data: {} },
			],
			edges: [
				{ id: 'e1', source: 'entry', target: 'choice1' },
				{ id: 'e2', source: 'choice1', target: 'yes_line', sourceHandle: 'yes' },
				{ id: 'e3', source: 'yes_line', target: 'end' },
			],
		};

		const result = compileDialogToGodot(graph, characters);
		expect(result.nodes.choice1).toMatchObject({
			type: 'choice',
			options: [
				{ text: 'Yes', next: 'yes_line', conditions: [] },
				{ text: 'No', next: 'end', conditions: [] },
			],
		});
	});
});
