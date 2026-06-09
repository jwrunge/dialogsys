import { characterById, resolvePortraitPath } from '../characters';
import type { Character } from '../schema/characters';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';
import {
	getEdgeForHandle,
	getOutgoing,
	getStartNodeId,
	nodeById,
	singleNextTarget,
} from '../graph/graphUtils';
import { defaultPlaytestState, evaluateConditions, type PlaytestState } from './evaluateConditions';

export type DialogueLineStep = {
	kind: 'line';
	nodeId: string;
	speaker: string;
	text: string;
	portraitPath?: string;
	characterState?: string;
};

export type DialogueDirectionStep = {
	kind: 'direction';
	nodeId: string;
	text: string;
};

export type DialogueChoiceStep = {
	kind: 'choice';
	nodeId: string;
	options: { id: string; text: string }[];
};

export type DialogueEndStep = { kind: 'end'; nodeId: string };

export type DialogueJumpStep = {
	kind: 'jump';
	nodeId: string;
	dialogId: string;
	entryNodeId?: string;
};

export type DialogueStep =
	| DialogueLineStep
	| DialogueDirectionStep
	| DialogueChoiceStep
	| DialogueEndStep
	| DialogueJumpStep;

export type DialoguePlayer = {
	graph: DialogGraph;
	characters: Character[];
	state: PlaytestState;
	nodeId: string | null;
	finished: boolean;
};

function applySetOps(node: GraphNode, state: PlaytestState): PlaytestState {
	const ops = node.data.setOps ?? [];
	if (ops.length === 0) return state;
	const next: PlaytestState = {
		global: { ...state.global },
		character: Object.fromEntries(
			Object.entries(state.character).map(([id, bag]) => [id, { ...bag }]),
		),
	};
	for (const op of ops) {
		if (op.scope === 'character' && op.characterId) {
			const bag = { ...(next.character[op.characterId] ?? {}) };
			bag[op.var] = op.value;
			next.character[op.characterId] = bag;
		} else {
			next.global[op.var] = op.value;
		}
	}
	return next;
}

function readBranchValue(node: GraphNode, state: PlaytestState): boolean | number | string | undefined {
	const varName = node.data.branchVar?.trim();
	if (!varName) return undefined;
	if (node.data.branchScope === 'character' && node.data.branchCharacterId) {
		return state.character[node.data.branchCharacterId]?.[varName];
	}
	return state.global[varName];
}

function resolveConditionTarget(
	node: GraphNode,
	edges: GraphEdge[],
	state: PlaytestState,
): string | null {
	const out = getOutgoing(edges, node.id);
	const forced = out.find((e) => e.data?.forceUse);
	if (forced) return forced.target;

	if (node.data.forceBranch === 'true') {
		return getEdgeForHandle(edges, node.id, 'true')?.target ?? null;
	}
	if (node.data.forceBranch === 'false') {
		return getEdgeForHandle(edges, node.id, 'false')?.target ?? null;
	}

	const actual = readBranchValue(node, state);
	const handle = actual ? 'true' : 'false';
	return (
		getEdgeForHandle(edges, node.id, handle)?.target ??
		getEdgeForHandle(edges, node.id, 'true')?.target ??
		singleNextTarget(edges, node.id)
	);
}

export function createDialoguePlayer(
	graph: DialogGraph,
	characters: Character[] = [],
	initialState: PlaytestState = defaultPlaytestState(),
): DialoguePlayer {
	const start = getStartNodeId(graph.nodes, graph.edges);
	return {
		graph,
		characters,
		state: initialState,
		nodeId: start,
		finished: !start,
	};
}

export function getDialogueStep(player: DialoguePlayer): DialogueStep | null {
	if (!player.nodeId || player.finished) return null;
	const node = nodeById(player.graph.nodes, player.nodeId);
	if (!node) return null;

	if (node.type === 'line') {
		const speaker = node.data.speaker ?? '';
		const char = characterById(player.characters, speaker);
		const stateId = node.data.characterState?.trim() || char?.defaultStateId;
		const portrait = resolvePortraitPath(char, stateId, node.data.portraitPath);
		return {
			kind: 'line',
			nodeId: node.id,
			speaker,
			text: node.data.text ?? '',
			portraitPath: portrait || undefined,
			characterState: stateId,
		};
	}

	if (node.type === 'direction') {
		return {
			kind: 'direction',
			nodeId: node.id,
			text: node.data.directionText ?? node.data.text ?? '',
		};
	}

	if (node.type === 'choice') {
		const options = (node.data.options ?? [])
			.filter((opt) => evaluateConditions(player.state, opt.conditions ?? []))
			.map((opt) => ({ id: opt.id, text: opt.text }));
		return { kind: 'choice', nodeId: node.id, options };
	}

	if (node.type === 'end') {
		return { kind: 'end', nodeId: node.id };
	}

	if (node.type === 'jump') {
		return {
			kind: 'jump',
			nodeId: node.id,
			dialogId: node.data.targetDialogId ?? '',
			entryNodeId: node.data.targetEntryNodeId,
		};
	}

	return null;
}

function nextNodeId(player: DialoguePlayer, choiceOptionId?: string): string | null {
	const node = nodeById(player.graph.nodes, player.nodeId!);
	if (!node) return null;
	const { nodes, edges } = player.graph;

	if (node.type === 'choice') {
		if (!choiceOptionId) return null;
		return getEdgeForHandle(edges, node.id, choiceOptionId)?.target ?? null;
	}

	if (node.type === 'condition') {
		return resolveConditionTarget(node, edges, player.state);
	}

	if (node.type === 'set_var') {
		return singleNextTarget(edges, node.id);
	}

	if (node.type === 'line' || node.type === 'direction' || node.type === 'blank') {
		return singleNextTarget(edges, node.id);
	}

	if (node.type === 'end' || node.type === 'jump') return null;
	return singleNextTarget(edges, node.id);
}

export function advanceDialogue(
	player: DialoguePlayer,
	choiceOptionId?: string,
): { player: DialoguePlayer; step: DialogueStep | null; autoSteps: DialogueStep[] } {
	if (!player.nodeId || player.finished) {
		return { player, step: null, autoSteps: [] };
	}

	let current = player;
	const autoSteps: DialogueStep[] = [];
	let node = nodeById(current.graph.nodes, current.nodeId);
	if (!node) {
		return { player: { ...current, finished: true, nodeId: null }, step: null, autoSteps };
	}

	// Auto-pass through structural nodes before showing the next beat.
	while (node && (node.type === 'set_var' || node.type === 'condition')) {
		if (node.type === 'set_var') {
			current = { ...current, state: applySetOps(node, current.state) };
		}
		const nextId = nextNodeId(current);
		if (!nextId) {
			return {
				player: { ...current, finished: true, nodeId: null },
				step: { kind: 'end', nodeId: node.id },
				autoSteps,
			};
		}
		current = { ...current, nodeId: nextId };
		node = nodeById(current.graph.nodes, current.nodeId);
	}

	const step = getDialogueStep(current);
	if (!step) {
		return { player: { ...current, finished: true, nodeId: null }, step: null, autoSteps };
	}

	if (step.kind === 'end' || step.kind === 'jump') {
		return { player: { ...current, finished: true, nodeId: null }, step, autoSteps };
	}

	if (step.kind === 'choice') {
		if (!choiceOptionId) {
			return { player: current, step, autoSteps };
		}
		const nextId = nextNodeId(current, choiceOptionId);
		if (!nextId) {
			return {
				player: { ...current, finished: true, nodeId: null },
				step: { kind: 'end', nodeId: current.nodeId! },
				autoSteps,
			};
		}
		current = { ...current, nodeId: nextId };
		return advanceDialogue(current);
	}

	// line / direction — advance pointer for the next call after user continues
	const nextId = nextNodeId(current);
	if (!nextId) {
		return {
			player: { ...current, finished: true, nodeId: null },
			step,
			autoSteps,
		};
	}
	const endNode = nodeById(current.graph.nodes, nextId);
	if (endNode?.type === 'end') {
		return {
			player: { ...current, finished: true, nodeId: null },
			step,
			autoSteps,
		};
	}
	return { player: { ...current, nodeId: nextId }, step, autoSteps };
}
