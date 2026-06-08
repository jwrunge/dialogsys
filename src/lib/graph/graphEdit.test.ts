import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../schema/graph';
import { insertNodeAfter, removeChoiceOption, setBranchTarget, unlinkNode } from './graphEdit';

const entry: GraphNode = { id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} };
const line: GraphNode = {
	id: 'line1',
	type: 'line',
	position: { x: 100, y: 0 },
	data: { text: 'Hi' },
};
const end: GraphNode = { id: 'end', type: 'end', position: { x: 200, y: 0 }, data: {} };

describe('setBranchTarget', () => {
	it('adds a branch edge when missing', () => {
		const edges: GraphEdge[] = [];
		const next = setBranchTarget(edges, 'cond', 'true', 'line1');
		expect(next).toHaveLength(1);
		expect(next[0]).toMatchObject({
			source: 'cond',
			target: 'line1',
			sourceHandle: 'true',
			data: { branch: 'true' },
		});
	});
});

describe('insertNodeAfter', () => {
	it('splices a node between existing neighbors', () => {
		const nodes = [entry, line, end];
		const edges: GraphEdge[] = [
			{ id: 'e1', source: 'entry', target: 'line1' },
			{ id: 'e2', source: 'line1', target: 'end' },
		];
		const blank: GraphNode = {
			id: 'blank1',
			type: 'blank',
			position: { x: 50, y: 0 },
			data: {},
		};

		const result = insertNodeAfter(nodes, edges, 'entry', blank);
		expect(result.nodes.map((n) => n.id)).toContain('blank1');
		expect(result.edges.some((e) => e.source === 'entry' && e.target === 'blank1')).toBe(true);
		expect(result.edges.some((e) => e.source === 'blank1' && e.target === 'line1')).toBe(true);
	});
});

describe('removeChoiceOption', () => {
	it('removes an option and its edge', () => {
		const choice: GraphNode = {
			id: 'choice1',
			type: 'choice',
			position: { x: 0, y: 0 },
			data: {
				options: [
					{ id: 'a', text: 'A', conditions: [] },
					{ id: 'b', text: 'B', conditions: [] },
				],
			},
		};
		const edges: GraphEdge[] = [
			{ id: 'ea', source: 'choice1', target: 'end', sourceHandle: 'a' },
			{ id: 'eb', source: 'choice1', target: 'end', sourceHandle: 'b' },
		];

		const result = removeChoiceOption([choice], edges, 'choice1', 'a');
		expect(result?.nodes[0].data.options).toHaveLength(1);
		expect(result?.edges).toHaveLength(1);
		expect(result?.edges[0].sourceHandle).toBe('b');
	});
});

describe('unlinkNode', () => {
	it('bypasses removed node by reconnecting neighbors', () => {
		const nodes = [entry, line, end];
		const edges: GraphEdge[] = [
			{ id: 'e1', source: 'entry', target: 'line1' },
			{ id: 'e2', source: 'line1', target: 'end' },
		];

		const result = unlinkNode(nodes, edges, 'line1');
		expect(result.nodes.map((n) => n.id)).toEqual(['entry', 'end']);
		expect(result.edges.some((e) => e.source === 'entry' && e.target === 'end')).toBe(true);
	});
});
