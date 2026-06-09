import type { FlowEdge, FlowGraph, FlowNode } from '../schema/flow';
import type { FlowPatchOp } from '../schema/flow-patch';

function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

export function computeFlowPatch(base: FlowGraph, next: FlowGraph): FlowPatchOp[] {
	const ops: FlowPatchOp[] = [];

	if (base.displayName !== next.displayName) {
		ops.push({ op: 'updateMeta', displayName: next.displayName });
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

export function applyFlowPatchOps(graph: FlowGraph, ops: FlowPatchOp[]): FlowGraph {
	let nodes: FlowNode[] = [...graph.nodes];
	let edges: FlowEdge[] = [...graph.edges];
	let displayName = graph.displayName;

	for (const op of ops) {
		switch (op.op) {
			case 'updateMeta':
				if (op.displayName !== undefined) displayName = op.displayName;
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
		nodes,
		edges,
	};
}
