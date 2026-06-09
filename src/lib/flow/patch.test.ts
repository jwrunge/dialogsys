import { describe, expect, it } from 'vitest';
import type { FlowGraph } from '../schema/flow';
import { applyFlowPatchOps, computeFlowPatch } from './patch';

const baseGraph: FlowGraph = {
	id: 'main',
	displayName: 'Main sequence',
	nodes: [
		{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
		{
			id: 'scene1',
			type: 'scene',
			position: { x: 200, y: 0 },
			data: { dialogId: 'tavern_intro' },
		},
	],
	edges: [{ id: 'e1', source: 'start', target: 'scene1' }],
	updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('flow patch', () => {
	it('diffs and applies scene node updates', () => {
		const next: FlowGraph = {
			...baseGraph,
			nodes: baseGraph.nodes.map((node) =>
				node.id === 'scene1' ? { ...node, data: { ...node.data, dialogId: 'other_scene' } } : node,
			),
		};
		const ops = computeFlowPatch(baseGraph, next);
		expect(ops).toHaveLength(1);
		const applied = applyFlowPatchOps(baseGraph, ops);
		expect(applied.nodes.find((n) => n.id === 'scene1')?.data.dialogId).toBe('other_scene');
	});
});
