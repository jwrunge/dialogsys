import { nanoid } from 'nanoid';
import type { GraphEdge, GraphNode } from '../schema/graph';
import { findEntryNode, getEdgeForHandle, getOutgoing, nodeById } from './graphUtils';
import { flattenActivePathWithDepth, getBlockMemberIds, type PathStep } from './pathTree';

const NON_DRAGGABLE_TYPES = new Set(['entry', 'end', 'choice', 'condition', 'jump', 'blank']);

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
		nextEdges = nextEdges.map((e) => (e.id === out.id ? { ...e, target: newNode.id } : e));
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

	const nextEdges = edges.filter((e) => e.target !== beforeId);
	for (const inc of incoming) {
		nextEdges.push({
			...inc,
			id: `e-${inc.source}-${newNode.id}-${nanoid(4)}`,
			target: newNode.id,
		});
	}
	nextEdges.push({
		id: `e-${newNode.id}-${beforeId}-${nanoid(4)}`,
		source: newNode.id,
		target: beforeId,
	});

	return { nodes: [...nodes, newNode], edges: nextEdges };
}

function cloneEdge(edge: GraphEdge, source: string, target: string): GraphEdge {
	return {
		...edge,
		id: `e-${source}-${target}-${nanoid(4)}`,
		source,
		target,
	};
}

function stepIndex(path: PathStep[], nodeId: string): number {
	return path.findIndex((s) => s.id === nodeId);
}

function sameDepthPred(path: PathStep[], idx: number, entryId: string | null): string | null {
	const depth = path[idx].depth;
	for (let i = idx - 1; i >= 0; i--) {
		if (path[i].depth === depth) return path[i].id;
		if (path[i].depth < depth) return path[i].id;
	}
	return entryId;
}

function sameDepthSucc(path: PathStep[], idx: number): string | null {
	const depth = path[idx].depth;
	for (let i = idx + 1; i < path.length; i++) {
		if (path[i].depth === depth) return path[i].id;
		if (path[i].depth < depth) return null;
	}
	return null;
}

function linkEdge(edges: GraphEdge[], sourceId: string, targetId: string): GraphEdge | undefined {
	return edges.find((e) => e.source === sourceId && e.target === targetId);
}

/** Move `moveId` before `beforeId` among same-depth peers on the active path. */
export function moveNodeBefore(
	nodes: GraphNode[],
	edges: GraphEdge[],
	moveId: string,
	beforeId: string,
	activeBranches: Record<string, string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (moveId === beforeId) return { nodes, edges };

	const path = flattenActivePathWithDepth(nodes, edges, activeBranches);
	const fromIdx = stepIndex(path, moveId);
	const toIdx = stepIndex(path, beforeId);
	if (fromIdx < 0 || toIdx < 0) return { nodes, edges };
	if (path[fromIdx].depth !== path[toIdx].depth) return { nodes, edges };

	const moveNode = nodeById(nodes, moveId);
	if (!moveNode || NON_DRAGGABLE_TYPES.has(moveNode.type)) return { nodes, edges };

	const blockMembers = getBlockMemberIds(nodes, edges, activeBranches, moveId);
	if (blockMembers.includes(beforeId) && beforeId !== moveId) return { nodes, edges };

	const entry = findEntryNode(nodes);
	const predId = sameDepthPred(path, fromIdx, entry?.id ?? null);
	const succId = sameDepthSucc(path, fromIdx);
	const predBeforeId = sameDepthPred(path, toIdx, entry?.id ?? null);

	if (!predId || !predBeforeId) return { nodes, edges };

	const predMoveEdge = linkEdge(edges, predId, moveId);
	const moveSuccEdge = succId ? linkEdge(edges, moveId, succId) : undefined;
	const predBeforeEdge = linkEdge(edges, predBeforeId, beforeId);

	if (!predMoveEdge || !predBeforeEdge) return { nodes, edges };
	if (succId && !moveSuccEdge) return { nodes, edges };

	const removeIds = new Set(
		[predMoveEdge.id, predBeforeEdge.id, moveSuccEdge?.id].filter(Boolean) as string[],
	);
	const nextEdges = edges.filter((e) => !removeIds.has(e.id));

	if (succId) {
		nextEdges.push(cloneEdge(predMoveEdge, predId, succId));
	}

	nextEdges.push(cloneEdge(predBeforeEdge, predBeforeId, moveId));
	nextEdges.push({
		id: `e-${moveId}-${beforeId}-${nanoid(4)}`,
		source: moveId,
		target: beforeId,
		data: moveSuccEdge?.data,
	});

	return { nodes, edges: nextEdges };
}

export function removeChoiceOption(
	nodes: GraphNode[],
	edges: GraphEdge[],
	nodeId: string,
	optionId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
	const node = nodes.find((n) => n.id === nodeId);
	if (!node || node.type !== 'choice') return null;
	const options = node.data.options ?? [];
	if (options.length <= 1) return null;

	return {
		nodes: nodes.map((n) =>
			n.id === nodeId
				? {
						...n,
						data: {
							...n.data,
							options: options.filter((o) => o.id !== optionId),
						},
					}
				: n,
		),
		edges: edges.filter(
			(e) => !(e.source === nodeId && (e.sourceHandle === optionId || e.data?.branch === optionId)),
		),
	};
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

	const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId).concat(bypass);

	return {
		nodes: nodes.filter((n) => n.id !== nodeId),
		edges: nextEdges,
	};
}
