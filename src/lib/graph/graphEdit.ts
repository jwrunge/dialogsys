import { nanoid } from 'nanoid';
import type { GraphEdge, GraphNode } from '../schema/graph';
import { getEdgeForHandle, getOutgoing } from './graphUtils';

export function setBranchTarget(
	edges: GraphEdge[],
	sourceId: string,
	handle: string,
	targetId: string,
): GraphEdge[] {
	const existing = getEdgeForHandle(edges, sourceId, handle);
	if (existing) {
		return edges.map((e) => (e.id === existing.id ? { ...e, target: targetId } : e));
	}
	const branchData =
		handle === 'true' || handle === 'false' ? { branch: handle as 'true' | 'false' } : {};
	return [
		...edges,
		{
			id: `e-${sourceId}-${handle}-${nanoid(4)}`,
			source: sourceId,
			target: targetId,
			sourceHandle: handle === 'default' ? undefined : handle,
			data: branchData,
		},
	];
}

function findOutgoingEdge(
	edges: GraphEdge[],
	afterId: string,
	sourceHandle?: string,
): GraphEdge | undefined {
	if (sourceHandle) {
		return getEdgeForHandle(edges, afterId, sourceHandle);
	}
	return getOutgoing(edges, afterId).find((e) => !e.sourceHandle) ?? getOutgoing(edges, afterId)[0];
}

export function insertNodeAfter(
	nodes: GraphNode[],
	edges: GraphEdge[],
	afterId: string,
	newNode: GraphNode,
	sourceHandle?: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const out = findOutgoingEdge(edges, afterId, sourceHandle);
	const nextTarget = out?.target;

	let nextEdges = [...edges];

	if (out) {
		nextEdges = nextEdges.map((e) =>
			e.id === out.id ? { ...e, target: newNode.id } : e,
		);
	} else if (sourceHandle) {
		nextEdges = setBranchTarget(nextEdges, afterId, sourceHandle, newNode.id);
	} else {
		nextEdges = [
			...nextEdges,
			{
				id: `e-${afterId}-${newNode.id}-${nanoid(4)}`,
				source: afterId,
				target: newNode.id,
			},
		];
	}

	if (nextTarget && newNode.type !== 'end' && newNode.type !== 'jump') {
		nextEdges = [
			...nextEdges,
			{
				id: `e-${newNode.id}-${nextTarget}-${nanoid(4)}`,
				source: newNode.id,
				target: nextTarget,
			},
		];
	}

	return { nodes: [...nodes, newNode], edges: nextEdges };
}

export function insertNodeBefore(
	nodes: GraphNode[],
	edges: GraphEdge[],
	beforeId: string,
	newNode: GraphNode,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const incoming = edges.filter((e) => e.target === beforeId);
	if (incoming.length === 0) {
		return insertNodeAfter(nodes, edges, beforeId, newNode);
	}

	let nextEdges = edges.filter((e) => e.target !== beforeId);
	for (const inc of incoming) {
		nextEdges.push({ ...inc, id: `e-${inc.source}-${newNode.id}-${nanoid(4)}`, target: newNode.id });
	}
	nextEdges.push({
		id: `e-${newNode.id}-${beforeId}-${nanoid(4)}`,
		source: newNode.id,
		target: beforeId,
	});

	return { nodes: [...nodes, newNode], edges: nextEdges };
}

/** Move `moveId` to sit immediately before `beforeId` in the edge chain. */
export function moveNodeBefore(
	nodes: GraphNode[],
	edges: GraphEdge[],
	moveId: string,
	beforeId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (moveId === beforeId) return { nodes, edges };

	const incomingToMove = edges.filter((e) => e.target === moveId);
	const outgoingFromMove = edges.filter((e) => e.source === moveId);
	const incomingToBefore = edges.filter((e) => e.target === beforeId);

	const defaultOut =
		outgoingFromMove.find((e) => !e.sourceHandle) ?? outgoingFromMove[0];
	const succId = defaultOut?.target;

	let nextEdges = edges.filter((e) => e.source !== moveId && e.target !== moveId);

	for (const inc of incomingToMove) {
		if (succId) {
			nextEdges.push({
				...inc,
				id: `e-${inc.source}-${succId}-${nanoid(4)}`,
				target: succId,
			});
		}
	}

	for (const inc of incomingToBefore) {
		nextEdges.push({
			...inc,
			id: `e-${inc.source}-${moveId}-${nanoid(4)}`,
			target: moveId,
		});
	}

	nextEdges.push({
		id: `e-${moveId}-${beforeId}-${nanoid(4)}`,
		source: moveId,
		target: beforeId,
		sourceHandle: defaultOut?.sourceHandle ?? undefined,
		data: defaultOut?.data,
	});

	for (const out of outgoingFromMove) {
		if (out.id !== defaultOut?.id) {
			nextEdges.push(out);
		}
	}

	return { nodes, edges: nextEdges };
}

export function unlinkNode(
	nodes: GraphNode[],
	edges: GraphEdge[],
	nodeId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const incoming = edges.filter((e) => e.target === nodeId);
	const outgoing = edges.filter((e) => e.source === nodeId);
	const bypass = incoming.flatMap((inc) =>
		outgoing.map((out) => ({
			id: `e-${inc.source}-${out.target}-${nanoid(4)}`,
			source: inc.source,
			target: out.target,
			sourceHandle: inc.sourceHandle ?? undefined,
			data: inc.data,
		})),
	);

	const nextEdges = edges
		.filter((e) => e.source !== nodeId && e.target !== nodeId)
		.concat(bypass);

	return {
		nodes: nodes.filter((n) => n.id !== nodeId),
		edges: nextEdges,
	};
}
