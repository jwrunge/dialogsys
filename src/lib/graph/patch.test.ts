import { describe, expect, it } from 'vitest';
import type { DialogGraph } from '../schema/graph';
import { hashDialogGraph } from './content-hash';
import { applyGraphPatchOps, computeGraphPatch } from './patch';

const baseGraph: DialogGraph = {
	id: 'tavern_intro',
	displayName: 'Tavern Intro',
	description: '',
	nodes: [
		{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
		{
			id: 'line1',
			type: 'line',
			position: { x: 100, y: 0 },
			data: { speaker: 'bartender', text: 'Welcome.' },
		},
	],
	edges: [{ id: 'e1', source: 'entry', target: 'line1' }],
	updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('graph patch', () => {
	it('diffs and applies line text updates', () => {
		const next: DialogGraph = {
			...baseGraph,
			nodes: baseGraph.nodes.map((node) =>
				node.id === 'line1' ? { ...node, data: { ...node.data, text: 'Hello, traveler.' } } : node,
			),
		};
		const ops = computeGraphPatch(baseGraph, next);
		expect(ops).toHaveLength(1);
		expect(ops[0].op).toBe('upsertNode');
		const applied = applyGraphPatchOps(baseGraph, ops);
		expect(applied.nodes.find((n) => n.id === 'line1')?.data.text).toBe('Hello, traveler.');
	});

	it('content hash changes when graph changes', () => {
		const next = applyGraphPatchOps(baseGraph, [
			{
				op: 'upsertNode',
				node: {
					id: 'line1',
					type: 'line',
					position: { x: 100, y: 0 },
					data: { speaker: 'bartender', text: 'Updated.' },
				},
			},
		]);
		expect(hashDialogGraph(baseGraph)).not.toBe(hashDialogGraph(next));
	});
});
