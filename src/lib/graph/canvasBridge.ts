import type { FlowEdge, FlowGraph, FlowNode } from '../schema/flow';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';

export type CanvasNode = {
	id: string;
	type?: string;
	position: { x: number; y: number };
	data?: Record<string, unknown>;
};

export type CanvasEdge = {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
	data?: Record<string, unknown>;
};

export function dialogGraphToCanvas(graph: DialogGraph): {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	syncKey: string;
} {
	return {
		nodes: graph.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		})),
		edges: graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		})),
		syncKey: `${graph.updatedAt ?? Date.now()}`,
	};
}

export function canvasToDialogGraph(input: {
	id: string;
	displayName: string;
	description: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}): DialogGraph {
	return {
		id: input.id,
		displayName: input.displayName,
		description: input.description,
		nodes: input.nodes.map((n) => ({
			id: n.id,
			type: n.type as GraphNode['type'],
			position: n.position,
			data: (n.data ?? {}) as GraphNode['data'],
		})),
		edges: input.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle ?? undefined,
			targetHandle: e.targetHandle ?? undefined,
			data: e.data as GraphEdge['data'],
		})),
	};
}

export function canvasNodeToGraphNode(node: CanvasNode): GraphNode {
	return {
		id: node.id,
		type: node.type as GraphNode['type'],
		position: node.position,
		data: (node.data ?? {}) as GraphNode['data'],
	};
}

export function flowGraphToCanvas(graph: FlowGraph): {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	syncKey: string;
} {
	return {
		nodes: graph.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		})),
		edges: graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		})),
		syncKey: `${graph.updatedAt ?? Date.now()}`,
	};
}

export function canvasToFlowGraph(input: {
	id: string;
	displayName: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}): FlowGraph {
	return {
		id: input.id,
		displayName: input.displayName,
		nodes: input.nodes.map((n) => ({
			id: n.id,
			type: n.type as FlowNode['type'],
			position: n.position,
			data: (n.data ?? {}) as FlowNode['data'],
		})),
		edges: input.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle ?? undefined,
			targetHandle: e.targetHandle ?? undefined,
			data: e.data as FlowEdge['data'],
		})),
	};
}

export function canvasNodeToFlowNode(node: CanvasNode): FlowNode {
	return {
		id: node.id,
		type: node.type as FlowNode['type'],
		position: node.position,
		data: (node.data ?? {}) as FlowNode['data'],
	};
}
