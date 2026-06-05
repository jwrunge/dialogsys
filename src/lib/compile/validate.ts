import { characterById, getStateIds } from '../characters';
import type { Character, CharactersFile } from '../schema/characters';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';

export type ValidationIssue = {
	level: 'error' | 'warning';
	code: string;
	message: string;
	dialogId?: string;
	nodeId?: string;
	characterId?: string;
	stateId?: string;
	edgeId?: string;
};

function getReachable(graph: DialogGraph): Set<string> {
	const nodeIds = new Set(graph.nodes.map((n) => n.id));
	const reachable = new Set<string>();
	const entry = graph.nodes.find((n) => n.type === 'entry');
	if (!entry) return reachable;

	const queue = [entry.id];
	while (queue.length) {
		const id = queue.shift()!;
		if (reachable.has(id)) continue;
		reachable.add(id);
		for (const e of graph.edges.filter((ed) => ed.source === id)) {
			if (nodeIds.has(e.target)) queue.push(e.target);
		}
	}
	return reachable;
}

function outgoing(edges: GraphEdge[], sourceId: string): GraphEdge[] {
	return edges.filter((e) => e.source === sourceId);
}

function hasForcedBranch(node: GraphNode, edges: GraphEdge[]): boolean {
	if (node.data.forceBranch) return true;
	return outgoing(edges, node.id).some((e) => e.data?.forceUse);
}

function validateLineNode(
	node: GraphNode,
	graph: DialogGraph,
	characters: Character[],
	issues: ValidationIssue[],
	stateUsage: Map<string, Set<string>>,
): void {
	if (!node.data.text?.trim()) {
		issues.push({
			level: 'warning',
			code: 'empty_line',
			message: 'Line node has no text',
			dialogId: graph.id,
			nodeId: node.id,
		});
	}

	const speaker = node.data.speaker;
	if (!speaker) return;

	const char = characterById(characters, speaker);
	if (!char) {
		issues.push({
			level: 'warning',
			code: 'unknown_speaker',
			message: `Unknown speaker "${speaker}"`,
			dialogId: graph.id,
			nodeId: node.id,
			characterId: speaker,
		});
		return;
	}

	const stateId = node.data.characterState?.trim();
	if (stateId) {
		if (!getStateIds(char).has(stateId)) {
			issues.push({
				level: 'warning',
				code: 'undefined_character_state',
				message: `Line uses state "${stateId}" for ${char.displayName}, but that state is not defined`,
				dialogId: graph.id,
				nodeId: node.id,
				characterId: char.id,
				stateId,
			});
		} else {
			if (!stateUsage.has(char.id)) stateUsage.set(char.id, new Set());
			stateUsage.get(char.id)!.add(stateId);
		}
	} else {
		if (!stateUsage.has(char.id)) stateUsage.set(char.id, new Set());
		stateUsage.get(char.id)!.add(char.defaultStateId);
	}
}

function validateConditionBranches(
	node: GraphNode,
	graph: DialogGraph,
	edges: GraphEdge[],
	issues: ValidationIssue[],
	reachable: Set<string>,
): void {
	const out = outgoing(edges, node.id);
	const trueEdge = out.find(
		(e) => e.sourceHandle === 'true' || e.data?.branch === 'true',
	);
	const falseEdge = out.find(
		(e) => e.sourceHandle === 'false' || e.data?.branch === 'false',
	);

	if (node.data.forceBranch === 'true' && falseEdge && !falseEdge.data?.ignoreUnusedWarning) {
		return;
	}
	if (node.data.forceBranch === 'false' && trueEdge && !trueEdge.data?.ignoreUnusedWarning) {
		return;
	}

	const forced = out.find((e) => e.data?.forceUse);
	if (forced) return;

	if (trueEdge?.data?.ignoreUnusedWarning || falseEdge?.data?.ignoreUnusedWarning) {
		return;
	}

	const branches: { label: string; edge?: GraphEdge }[] = [
		{ label: 'true', edge: trueEdge },
		{ label: 'false', edge: falseEdge },
	];

	for (const { label, edge } of branches) {
		if (!edge) {
			issues.push({
				level: 'warning',
				code: 'unused_branch',
				message: `Condition "${node.id}" has no ${label} branch connected`,
				dialogId: graph.id,
				nodeId: node.id,
			});
			continue;
		}
		if (!reachable.has(edge.target)) {
			issues.push({
				level: 'warning',
				code: 'unused_branch',
				message: `Condition ${label} branch targets unreachable node "${edge.target}"`,
				dialogId: graph.id,
				nodeId: node.id,
				edgeId: edge.id,
			});
		}
	}
}

function validateChoiceNode(
	node: GraphNode,
	graph: DialogGraph,
	edges: GraphEdge[],
	issues: ValidationIssue[],
	reachable: Set<string>,
): void {
	const options = node.data.options ?? [];
	if (options.length === 0) {
		issues.push({
			level: 'error',
			code: 'empty_choice',
			message: 'Choice node has no options',
			dialogId: graph.id,
			nodeId: node.id,
		});
		return;
	}

	const out = outgoing(edges, node.id);
	if (out.some((e) => e.data?.forceUse)) return;

	for (const opt of options) {
		if (!opt.text?.trim()) {
			issues.push({
				level: 'error',
				code: 'empty_option',
				message: 'Choice option has no text',
				dialogId: graph.id,
				nodeId: node.id,
			});
		}

		const edge = out.find((e) => e.sourceHandle === opt.id);
		if (!edge) {
			issues.push({
				level: 'warning',
				code: 'unused_choice_branch',
				message: `Choice option "${opt.text || opt.id}" has no connected branch`,
				dialogId: graph.id,
				nodeId: node.id,
			});
			continue;
		}

		if (!edge.data?.forceUse && !reachable.has(edge.target)) {
			issues.push({
				level: 'warning',
				code: 'unused_choice_branch',
				message: `Choice option "${opt.text}" leads to unreachable node "${edge.target}"`,
				dialogId: graph.id,
				nodeId: node.id,
				edgeId: edge.id,
			});
		}
	}

}

export function validateDialog(
	graph: DialogGraph,
	characters: CharactersFile,
	allDialogIds: string[],
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const charList = characters.characters;
	const charIds = new Set(charList.map((c) => c.id));
	const nodeIds = new Set(graph.nodes.map((n) => n.id));
	const stateUsage = new Map<string, Set<string>>();
	const entryNodes = graph.nodes.filter((n) => n.type === 'entry');
	const reachable = getReachable(graph);

	if (entryNodes.length === 0) {
		issues.push({
			level: 'error',
			code: 'missing_entry',
			message: 'Graph must have an entry node',
			dialogId: graph.id,
		});
	} else if (entryNodes.length > 1) {
		issues.push({
			level: 'warning',
			code: 'multiple_entry',
			message: 'Multiple entry nodes; first will be used',
			dialogId: graph.id,
		});
	}

	for (const node of graph.nodes) {
		if (node.type === 'blank') {
			issues.push({
				level: 'error',
				code: 'blank_node',
				message: `Step "${node.id}" has no type — choose Line, Choice, etc. before export`,
				dialogId: graph.id,
				nodeId: node.id,
			});
		}

		if (node.type === 'line') {
			validateLineNode(node, graph, charList, issues, stateUsage);
		}

		if (node.type === 'choice') {
			validateChoiceNode(node, graph, graph.edges, issues, reachable);
		}

		if (node.type === 'condition') {
			if (!node.data.branchVar?.trim()) {
				issues.push({
					level: 'warning',
					code: 'empty_condition',
					message: 'Condition node has no variable set',
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
			validateConditionBranches(node, graph, graph.edges, issues, reachable);
		}

		if (node.type === 'jump') {
			const target = node.data.targetDialogId;
			if (!target || !allDialogIds.includes(target)) {
				issues.push({
					level: 'error',
					code: 'invalid_jump',
					message: `Jump target dialog "${target ?? ''}" not found`,
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
		}

		if (!reachable.has(node.id) && node.type !== 'direction') {
			const skipped =
				node.type === 'condition' && hasForcedBranch(node, graph.edges);
			if (!skipped) {
				issues.push({
					level: 'warning',
					code: 'unreachable_dialog',
					message: `Node "${node.id}" is unreachable from entry`,
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
		}
	}

	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
			issues.push({
				level: 'error',
				code: 'dangling_edge',
				message: `Edge ${edge.id} references missing node`,
				dialogId: graph.id,
				edgeId: edge.id,
			});
		}
	}

	return issues;
}

export function validateProject(
	graphs: DialogGraph[],
	characters: CharactersFile,
): ValidationIssue[] {
	const dialogIds = graphs.map((g) => g.id);
	const perDialog = graphs.flatMap((g) => validateDialog(g, characters, dialogIds));

	const projectStateUsage = new Map<string, Set<string>>();
	for (const graph of graphs) {
		for (const node of graph.nodes) {
			if (node.type !== 'line' || !node.data.speaker) continue;
			const char = characterById(characters.characters, node.data.speaker);
			if (!char) continue;
			const stateId = node.data.characterState?.trim() || char.defaultStateId;
			if (!projectStateUsage.has(char.id)) projectStateUsage.set(char.id, new Set());
			projectStateUsage.get(char.id)!.add(stateId);
		}
	}

	const globalUnused: ValidationIssue[] = [];
	for (const char of characters.characters) {
		const used = projectStateUsage.get(char.id) ?? new Set<string>();
		for (const state of char.states) {
			if (!used.has(state.id) && state.id !== char.defaultStateId) {
				const already = perDialog.some(
					(i) =>
						i.code === 'unused_character_state' &&
						i.characterId === char.id &&
						i.stateId === state.id,
				);
				if (!already) {
					globalUnused.push({
						level: 'warning',
						code: 'unused_character_state',
						message: `State "${state.label}" (${state.id}) is defined for ${char.displayName} but never used in any dialog`,
						characterId: char.id,
						stateId: state.id,
					});
				}
			}
		}
	}

	const jumpedTo = new Set<string>();
	for (const graph of graphs) {
		for (const node of graph.nodes) {
			if (node.type === 'jump' && node.data.targetDialogId) {
				jumpedTo.add(node.data.targetDialogId);
			}
		}
	}
	if (graphs.length > 1) {
		for (const graph of graphs) {
			if (!jumpedTo.has(graph.id)) {
				globalUnused.push({
					level: 'warning',
					code: 'unused_dialog',
					message: `Dialog "${graph.displayName}" (${graph.id}) is never referenced by a jump from another dialog`,
					dialogId: graph.id,
				});
			}
		}
	}

	return [...perDialog, ...globalUnused];
}
