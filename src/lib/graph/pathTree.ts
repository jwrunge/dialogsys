import type { GraphEdge, GraphNode } from '../schema/graph';
import {
	findEntryNode,
	getEdgeForHandle,
	getOutgoing,
	getStartNodeId,
	nodeById,
	singleNextTarget,
} from './graphUtils';

export type TreeBranch = {
	id: string;
	label: string;
	targetId: string | null;
};

export type PathTreeItem = {
	node: GraphNode;
	depth: number;
	children: PathTreeItem[];
	divergence?: {
		branches: TreeBranch[];
		activeBranchId: string;
	};
	isMerge?: boolean;
};

export function getChoiceBranches(node: GraphNode, edges: GraphEdge[]): TreeBranch[] {
	return (node.data.options ?? []).map((opt) => ({
		id: opt.id,
		label: opt.text || opt.id,
		targetId: getEdgeForHandle(edges, node.id, opt.id)?.target ?? null,
	}));
}

export function getConditionBranches(node: GraphNode, edges: GraphEdge[]): TreeBranch[] {
	const trueLabel = node.data.trueLabel?.trim() || 'True';
	const falseLabel = node.data.falseLabel?.trim() || 'False';
	return [
		{
			id: 'true',
			label: trueLabel,
			targetId: getEdgeForHandle(edges, node.id, 'true')?.target ?? null,
		},
		{
			id: 'false',
			label: falseLabel,
			targetId: getEdgeForHandle(edges, node.id, 'false')?.target ?? null,
		},
	];
}

export function buildPathTree(
	nodes: GraphNode[],
	edges: GraphEdge[],
	activeBranches: Record<string, string>,
	nodeId: string,
	visited: Set<string> = new Set(),
	depth = 0,
): PathTreeItem | null {
	const node = nodeById(nodes, nodeId);
	if (!node) return null;

	if (visited.has(nodeId)) {
		return {
			node,
			depth,
			children: [],
			isMerge: true,
		};
	}

	const nextVisited = new Set(visited);
	nextVisited.add(nodeId);

	if (node.type === 'end' || node.type === 'jump') {
		return { node, depth, children: [] };
	}

	if (node.type === 'blank') {
		const nextId = singleNextTarget(edges, nodeId);
		const children = nextId
			? [buildPathTree(nodes, edges, activeBranches, nextId, nextVisited, depth + 1)].filter(
					Boolean,
				)
			: [];
		return {
			node,
			depth,
			children: children as PathTreeItem[],
		};
	}

	if (node.type === 'choice') {
		const branches = getChoiceBranches(node, edges);
		const activeBranchId = activeBranches[node.id] ?? branches[0]?.id ?? '';
		const active = branches.find((b) => b.id === activeBranchId) ?? branches[0];
		const children = active?.targetId
			? [buildPathTree(nodes, edges, activeBranches, active.targetId, nextVisited, depth + 1)].filter(
					Boolean,
				)
			: [];
		return {
			node,
			depth,
			children: children as PathTreeItem[],
			divergence: { branches, activeBranchId },
		};
	}

	if (node.type === 'condition') {
		const forced = node.data.forceBranch;
		const branches = getConditionBranches(node, edges);
		const activeBranchId =
			forced ?? activeBranches[node.id] ?? branches[0]?.id ?? 'true';
		const active = branches.find((b) => b.id === activeBranchId) ?? branches[0];
		const children = active?.targetId
			? [buildPathTree(nodes, edges, activeBranches, active.targetId, nextVisited, depth + 1)].filter(
					Boolean,
				)
			: [];
		return {
			node,
			depth,
			children: children as PathTreeItem[],
			divergence: { branches, activeBranchId },
		};
	}

	const nextId = singleNextTarget(edges, nodeId);
	const children = nextId
		? [buildPathTree(nodes, edges, activeBranches, nextId, nextVisited, depth + 1)].filter(Boolean)
		: [];
	return {
		node,
		depth,
		children: children as PathTreeItem[],
	};
}

export function buildMainPathTree(
	nodes: GraphNode[],
	edges: GraphEdge[],
	activeBranches: Record<string, string>,
): PathTreeItem | null {
	const startId = getStartNodeId(nodes, edges);
	if (!startId) {
		const entry = findEntryNode(nodes);
		if (!entry) return null;
		return { node: entry, depth: 0, children: [] };
	}
	return buildPathTree(nodes, edges, activeBranches, startId);
}

export function getUnreachableNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
	const reachable = new Set<string>();
	const entry = findEntryNode(nodes);
	if (!entry) return nodes.filter((n) => n.type !== 'entry');

	const queue = [entry.id];
	while (queue.length) {
		const id = queue.shift()!;
		if (reachable.has(id)) continue;
		reachable.add(id);
		for (const edge of getOutgoing(edges, id)) {
			queue.push(edge.target);
		}
	}

	return nodes.filter((n) => !reachable.has(n.id) && n.type !== 'entry');
}

export function flattenActivePath(
	nodes: GraphNode[],
	edges: GraphEdge[],
	activeBranches: Record<string, string>,
): string[] {
	const result: string[] = [];

	function walk(nodeId: string, visited: Set<string>) {
		const node = nodeById(nodes, nodeId);
		if (!node || visited.has(nodeId)) return;
		visited.add(nodeId);
		result.push(nodeId);

		if (node.type === 'end' || node.type === 'jump') return;

		if (node.type === 'choice') {
			const bid = activeBranches[node.id] ?? node.data.options?.[0]?.id ?? '';
			const target = bid ? getEdgeForHandle(edges, node.id, bid)?.target : null;
			if (target) walk(target, visited);
			return;
		}

		if (node.type === 'condition') {
			const bid = node.data.forceBranch ?? activeBranches[node.id] ?? 'true';
			const target = getEdgeForHandle(edges, node.id, bid)?.target;
			if (target) walk(target, visited);
			return;
		}

		const nextId = singleNextTarget(edges, nodeId);
		if (nextId) walk(nextId, visited);
	}

	const startId = getStartNodeId(nodes, edges);
	if (startId) walk(startId, new Set());
	return result;
}

export function getPathTailNodeId(
	nodes: GraphNode[],
	edges: GraphEdge[],
	activeBranches: Record<string, string>,
): string | null {
	let tree = buildMainPathTree(nodes, edges, activeBranches);
	if (!tree) return findEntryNode(nodes)?.id ?? null;

	while (tree.children.length > 0) {
		tree = tree.children[0];
	}
	return tree.node.id;
}
