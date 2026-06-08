import { findEntryNode, getOutgoing, nodeById, singleNextTarget } from '../graph/graphUtils';
import type { Character } from '../schema/characters';
import type { FlowEdge, FlowGraph, FlowNode } from '../schema/flow';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';

export type FlowFirstMeeting = {
	characterId: string;
	displayName: string;
};

export type FlowAnalysisResult = Map<string, FlowFirstMeeting[]>;

function sceneVisitOrder(graph: FlowGraph): string[] {
	const start = graph.nodes.find((n) => n.type === 'start');
	if (!start) return [];

	const outgoing = new Map<string, FlowEdge[]>();
	for (const edge of graph.edges) {
		const list = outgoing.get(edge.source) ?? [];
		list.push(edge);
		outgoing.set(edge.source, list);
	}

	const order: string[] = [];
	const visited = new Set<string>();
	const queue = [start.id];

	while (queue.length > 0) {
		const id = queue.shift()!;
		if (visited.has(id)) continue;
		visited.add(id);

		const node = graph.nodes.find((n) => n.id === id);
		if (node?.type === 'scene') order.push(id);

		for (const edge of outgoing.get(id) ?? []) {
			if (!visited.has(edge.target)) queue.push(edge.target);
		}
	}

	return order;
}

function speakersInDialogOrder(nodes: GraphNode[], edges: GraphEdge[]): string[] {
	const entry = findEntryNode(nodes);
	if (!entry) return [];

	const speakers: string[] = [];
	const visited = new Set<string>();

	function walk(nodeId: string) {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);

		const node = nodeById(nodes, nodeId);
		if (!node) return;

		if (node.type === 'line' && node.data.speaker) {
			speakers.push(node.data.speaker);
		}

		if (node.type === 'choice' || node.type === 'condition') {
			for (const edge of getOutgoing(edges, nodeId)) {
				walk(edge.target);
			}
			return;
		}

		const next = singleNextTarget(edges, nodeId);
		if (next) walk(next);
	}

	const first = singleNextTarget(edges, entry.id);
	if (first) walk(first);

	return speakers;
}

export function analyzeFlowBranches(
	graph: FlowGraph,
	dialogs: Record<string, DialogGraph>,
	characters: Character[],
): FlowAnalysisResult {
	const charNames = new Map(characters.map((c) => [c.id, c.displayName]));
	const seen = new Set<string>();
	const result: FlowAnalysisResult = new Map();

	for (const sceneId of sceneVisitOrder(graph)) {
		const node = graph.nodes.find((n) => n.id === sceneId);
		const dialogId = node?.data.dialogId;
		if (!dialogId) {
			result.set(sceneId, []);
			continue;
		}

		const dialog = dialogs[dialogId];
		if (!dialog) {
			result.set(sceneId, []);
			continue;
		}

		const meetings: FlowFirstMeeting[] = [];
		for (const speakerId of speakersInDialogOrder(dialog.nodes, dialog.edges)) {
			if (seen.has(speakerId)) continue;
			seen.add(speakerId);
			meetings.push({
				characterId: speakerId,
				displayName: charNames.get(speakerId) ?? speakerId,
			});
		}
		result.set(sceneId, meetings);
	}

	return result;
}

export function applyFirstMeetings(nodes: FlowNode[], analysis: FlowAnalysisResult): FlowNode[] {
	return nodes.map((node) => {
		if (node.type !== 'scene') return node;
		const meetings = analysis.get(node.id) ?? [];
		return {
			...node,
			data: {
				...node.data,
				firstMeetings: meetings,
			},
		};
	});
}
