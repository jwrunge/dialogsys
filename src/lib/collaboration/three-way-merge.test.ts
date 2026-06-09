import { describe, expect, it } from 'vitest';
import type { DialogGraph } from '../schema/graph';
import { mergeDialogGraph } from './patch-merge';
import { mergeEntityList, mergeText, mergeValue } from './three-way-merge';

describe('three-way merge', () => {
	it('mergeValue keeps remote when local unchanged', () => {
		expect(mergeValue('hello', 'hello', 'hello world')).toBe('hello world');
	});

	it('mergeValue keeps local when remote unchanged', () => {
		expect(mergeValue('hello', 'hello world', 'hello')).toBe('hello world');
	});

	it('mergeValue prefers local on conflict', () => {
		expect(mergeValue('hello', 'local', 'remote')).toBe('local');
	});

	it('mergeEntityList combines non-overlapping node edits', () => {
		const ancestor = [
			{ id: 'line1', type: 'line', data: { text: 'Hi', speaker: 'a' } },
			{ id: 'line2', type: 'line', data: { text: 'Bye', speaker: 'b' } },
		];
		const local = [
			{ id: 'line1', type: 'line', data: { text: 'Hi local', speaker: 'a' } },
			{ id: 'line2', type: 'line', data: { text: 'Bye', speaker: 'b' } },
		];
		const remote = [
			{ id: 'line1', type: 'line', data: { text: 'Hi', speaker: 'a' } },
			{ id: 'line2', type: 'line', data: { text: 'Bye remote', speaker: 'b' } },
		];

		const merged = mergeEntityList(ancestor, local, remote);
		expect(merged.find((n) => n.id === 'line1')?.data.text).toBe('Hi local');
		expect(merged.find((n) => n.id === 'line2')?.data.text).toBe('Bye remote');
	});

	it('mergeText merges line edits independently', () => {
		const ancestor = '# Title\n\nHello.';
		const local = '# Title\n\nHello local.';
		const remote = '# Title\n\nHello remote.';
		expect(mergeText(ancestor, local, remote)).toBe('# Title\n\nHello local.');
	});
});

describe('mergeDialogGraph', () => {
	const base: DialogGraph = {
		id: 'scene',
		displayName: 'Scene',
		description: '',
		nodes: [
			{ id: 'line1', type: 'line', position: { x: 0, y: 0 }, data: { text: 'A', speaker: 'x' } },
		],
		edges: [],
		updatedAt: '2026-01-01T00:00:00.000Z',
	};

	it('preserves local and remote edits on different nodes', () => {
		const local: DialogGraph = {
			...base,
			nodes: [
				...base.nodes,
				{ id: 'line2', type: 'line', position: { x: 1, y: 0 }, data: { text: 'Local', speaker: 'y' } },
			],
		};
		const remote: DialogGraph = {
			...base,
			nodes: base.nodes.map((node) =>
				node.id === 'line1' ? { ...node, data: { ...node.data, text: 'Remote' } } : node,
			),
		};

		const merged = mergeDialogGraph(base, local, remote);
		expect(merged.nodes.find((n) => n.id === 'line1')?.data.text).toBe('Remote');
		expect(merged.nodes.find((n) => n.id === 'line2')?.data.text).toBe('Local');
	});
});
