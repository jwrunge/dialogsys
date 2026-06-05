import type { GraphEdge, GraphNode } from '../schema/graph';

export function findEntryNode(nodes: GraphNode[]): GraphNode | undefined {
	return nodes.find((n) => n.type === 'entry');
}

export function getOutgoing(edges: GraphEdge[], sourceId: string): GraphEdge[] {
	return edges.filter((e) => e.source === sourceId);
}

export function getEdgeForHandle(
	edges: GraphEdge[],
	sourceId: string,
	handle: string,
): GraphEdge | undefined {
	return edges.find(
		(e) =>
			e.source === sourceId &&
			(e.sourceHandle === handle ||
				e.data?.branch === handle ||
				(handle === 'default' && (e.sourceHandle == null || e.sourceHandle === ''))),
	);
}

export function singleNextTarget(
	edges: GraphEdge[],
	sourceId: string,
	handle?: string,
): string | null {
	const out = getOutgoing(edges, sourceId);
	const filtered = handle
		? out.filter(
				(e) =>
					e.sourceHandle === handle ||
					e.data?.branch === handle ||
					(!e.sourceHandle && handle === 'default'),
			)
		: out.filter((e) => !e.sourceHandle);
	return filtered[0]?.target ?? null;
}

export function getStartNodeId(nodes: GraphNode[], edges: GraphEdge[]): string | null {
	const entry = findEntryNode(nodes);
	if (!entry) return null;
	return singleNextTarget(edges, entry.id);
}

export function nodeById(nodes: GraphNode[], id: string): GraphNode | undefined {
	return nodes.find((n) => n.id === id);
}
