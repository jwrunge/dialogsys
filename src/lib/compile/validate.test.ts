import { describe, expect, it } from 'vitest';
import type { CharactersFile } from '../schema/characters';
import type { DialogGraph } from '../schema/graph';
import { validateDialog, validateProject } from './validate';

const emptyCharacters: CharactersFile = { characters: [] };

function minimalGraph(overrides: Partial<DialogGraph> = {}): DialogGraph {
	return {
		id: 'test_scene',
		displayName: 'Test',
		description: '',
		nodes: [
			{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
			{
				id: 'line1',
				type: 'line',
				position: { x: 100, y: 0 },
				data: { text: 'Hello' },
			},
			{ id: 'end', type: 'end', position: { x: 200, y: 0 }, data: {} },
		],
		edges: [
			{ id: 'e1', source: 'entry', target: 'line1' },
			{ id: 'e2', source: 'line1', target: 'end' },
		],
		...overrides,
	};
}

describe('validateDialog', () => {
	it('reports missing entry node', () => {
		const graph = minimalGraph({
			nodes: [{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} }],
			edges: [],
		});
		const issues = validateDialog(graph, emptyCharacters, ['test_scene']);
		expect(issues.some((i) => i.code === 'missing_entry')).toBe(true);
	});

	it('warns on empty line text', () => {
		const graph = minimalGraph({
			nodes: [
				{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
				{ id: 'line1', type: 'line', position: { x: 0, y: 0 }, data: { text: '  ' } },
				{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
			],
		});
		const issues = validateDialog(graph, emptyCharacters, ['test_scene']);
		expect(issues.some((i) => i.code === 'empty_line')).toBe(true);
	});

	it('errors on blank nodes', () => {
		const graph = minimalGraph({
			nodes: [
				{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
				{ id: 'blank1', type: 'blank', position: { x: 0, y: 0 }, data: {} },
				{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
			],
			edges: [
				{ id: 'e1', source: 'entry', target: 'blank1' },
				{ id: 'e2', source: 'blank1', target: 'end' },
			],
		});
		const issues = validateDialog(graph, emptyCharacters, ['test_scene']);
		expect(issues.some((i) => i.code === 'blank_node' && i.level === 'error')).toBe(true);
	});
});

describe('validateProject', () => {
	it('returns no errors for a minimal valid graph', () => {
		const issues = validateProject([minimalGraph()], emptyCharacters);
		expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
	});
});
