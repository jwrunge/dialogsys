import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';
import type { GraphPatchOp } from '../schema/graph-patch';

function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

export function computeGraphPatch(base: DialogGraph, next: DialogGraph): GraphPatchOp[] {
	const ops: GraphPatchOp[] = [];

	if (base.displayName !== next.displayName || base.description !== next.description) {
		ops.push({
			op: 'updateMeta',
			displayName: next.displayName,
			description: next.description,
		});
	}

	const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
	const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));

	for (const [id, node] of nextNodes) {
		const previous = baseNodes.get(id);
		if (!previous || stableJson(previous) !== stableJson(node)) {
			ops.push({ op: 'upsertNode', node });
		}
	}
	for (const id of baseNodes.keys()) {
		if (!nextNodes.has(id)) {
			ops.push({ op: 'removeNode', nodeId: id });
		}
	}

	const baseEdges = new Map(base.edges.map((edge) => [edge.id, edge]));
	const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));

	for (const [id, edge] of nextEdges) {
		const previous = baseEdges.get(id);
		if (!previous || stableJson(previous) !== stableJson(edge)) {
			ops.push({ op: 'upsertEdge', edge });
		}
	}
	for (const id of baseEdges.keys()) {
		if (!nextEdges.has(id)) {
			ops.push({ op: 'removeEdge', edgeId: id });
		}
	}

	return ops;
}

export function applyGraphPatchOps(graph: DialogGraph, ops: GraphPatchOp[]): DialogGraph {
	let nodes: GraphNode[] = [...graph.nodes];
	let edges: GraphEdge[] = [...graph.edges];
	let displayName = graph.displayName;
	let description = graph.description;

	for (const op of ops) {
		switch (op.op) {
			case 'updateMeta':
				if (op.displayName !== undefined) displayName = op.displayName;
				if (op.description !== undefined) description = op.description;
				break;
			case 'upsertNode': {
				const index = nodes.findIndex((node) => node.id === op.node.id);
				if (index >= 0) nodes[index] = op.node;
				else nodes = [...nodes, op.node];
				break;
			}
			case 'removeNode':
				nodes = nodes.filter((node) => node.id !== op.nodeId);
				edges = edges.filter((edge) => edge.source !== op.nodeId && edge.target !== op.nodeId);
				break;
			case 'upsertEdge': {
				const index = edges.findIndex((edge) => edge.id === op.edge.id);
				if (index >= 0) edges[index] = op.edge;
				else edges = [...edges, op.edge];
				break;
			}
			case 'removeEdge':
				edges = edges.filter((edge) => edge.id !== op.edgeId);
				break;
		}
	}

	return {
		...graph,
		displayName,
		description,
		nodes,
		edges,
	};
}
