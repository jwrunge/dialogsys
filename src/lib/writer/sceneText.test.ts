import { describe, expect, it } from 'vitest';
import type { DialogGraph } from '../schema/graph';
import {
	applySceneTextBlocks,
	graphToPlainSceneText,
	parseSceneText,
	plainTextToGraph,
} from './sceneText';

const graph: DialogGraph = {
	id: 'tavern_intro',
	displayName: 'Tavern Intro',
	description: '',
	nodes: [
		{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
		{
			id: 'line_greet',
			type: 'line',
			position: { x: 0, y: 0 },
			data: { speaker: 'bartender', text: 'Welcome.' },
		},
		{
			id: 'choice_main',
			type: 'choice',
			position: { x: 0, y: 0 },
			data: {
				options: [
					{ id: 'opt_a', text: 'Ale', conditions: [] },
					{ id: 'opt_b', text: 'Leave', conditions: [] },
				],
			},
		},
		{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
	],
	edges: [
		{ id: 'e1', source: 'entry', target: 'line_greet' },
		{ id: 'e2', source: 'line_greet', target: 'choice_main' },
		{ id: 'e3', source: 'choice_main', target: 'end', sourceHandle: 'opt_a' },
		{ id: 'e4', source: 'choice_main', target: 'end', sourceHandle: 'opt_b' },
	],
	updatedAt: '2026-01-01T00:00:00.000Z',
};

const characters = [
	{
		id: 'bartender',
		displayName: 'Bartender',
		bio: '',
		portraitPath: '',
		tags: [],
		voiceNotes: '',
		defaultStateId: 'default',
		states: [{ id: 'default', label: 'Default', portraitPath: '', optOutUnusedWarning: false }],
	},
];

describe('sceneText', () => {
	it('serializes speaker lines and choices to plain text', () => {
		const text = graphToPlainSceneText(graph, characters);
		expect(text).toContain('Bartender: Welcome.');
		expect(text).toContain('[[choice:choice_main]]');
		expect(text).toContain('Ale\tLeave');
	});

	it('parses speaker and direction lines', () => {
		const blocks = parseSceneText('The room is dim.\nBARTENDER: Hello there.');
		expect(blocks[0]).toEqual({ type: 'direction', text: 'The room is dim.' });
		expect(blocks[1]).toMatchObject({ type: 'line', speaker: 'BARTENDER', text: 'Hello there.' });
	});

	it('updates line text from plain text import', () => {
		const text = 'Bartender: Hello, traveler.\n[[choice:choice_main]]\nAle\tLeave\n[[/choice]]\n';
		const next = plainTextToGraph(graph, text, characters);
		const line = next.nodes.find((n) => n.id === 'line_greet');
		expect(line?.data.text).toBe('Hello, traveler.');
	});
});
