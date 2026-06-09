import { describe, expect, it } from 'vitest';
import type { DialogGraph } from '../schema/graph';
import { advanceDialogue, createDialoguePlayer } from './dialoguePlayer';

const graph: DialogGraph = {
	id: 'test',
	displayName: 'Test',
	description: '',
	nodes: [
		{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
		{
			id: 'line1',
			type: 'line',
			position: { x: 0, y: 0 },
			data: { speaker: 'hero', text: 'Hi' },
		},
		{
			id: 'choice1',
			type: 'choice',
			position: { x: 0, y: 0 },
			data: {
				options: [
					{ id: 'yes', text: 'Yes', conditions: [] },
					{ id: 'no', text: 'No', conditions: [] },
				],
			},
		},
		{
			id: 'line2',
			type: 'line',
			position: { x: 0, y: 0 },
			data: { speaker: 'hero', text: 'Done' },
		},
		{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
	],
	edges: [
		{ id: 'e1', source: 'entry', target: 'line1' },
		{ id: 'e2', source: 'line1', target: 'choice1' },
		{ id: 'e3', source: 'choice1', target: 'line2', sourceHandle: 'yes' },
		{ id: 'e4', source: 'choice1', target: 'end', sourceHandle: 'no' },
		{ id: 'e5', source: 'line2', target: 'end' },
	],
};

describe('dialoguePlayer', () => {
	it('plays lines and choices in order', () => {
		let player = createDialoguePlayer(graph);
		let result = advanceDialogue(player);
		expect(result.step?.kind).toBe('line');
		expect(result.step && 'text' in result.step ? result.step.text : '').toBe('Hi');

		result = advanceDialogue(result.player);
		expect(result.step?.kind).toBe('choice');

		result = advanceDialogue(result.player, 'yes');
		expect(result.step?.kind).toBe('line');
		expect(result.step && 'text' in result.step ? result.step.text : '').toBe('Done');
	});
});
