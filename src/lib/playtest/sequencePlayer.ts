import type { Character } from '../schema/characters';
import type { DialogGraph } from '../schema/graph';
import type { FlowGraph, FlowNode } from '../schema/flow';
import type { GameStateProperty } from '../schema/gameState';
import { getOutgoing, nodeById, singleNextTarget } from '../graph/graphUtils';
import {
	createDialoguePlayer,
	type DialoguePlayer,
	type DialogueStep,
	advanceDialogue,
} from './dialoguePlayer';
import { defaultPlaytestState, type PlaytestState } from './evaluateConditions';

export type SequenceSceneStep = {
	kind: 'scene';
	flowNodeId: string;
	label: string;
	dialogId: string;
};

export type SequenceBranchStep = {
	kind: 'branch';
	flowNodeId: string;
	label: string;
	options: { id: string; label: string }[];
};

export type SequenceEndStep = { kind: 'end'; flowNodeId: string };

export type SequenceStep = SequenceSceneStep | SequenceBranchStep | SequenceEndStep;

export type SequencePlayer = {
	flow: FlowGraph;
	dialogs: Record<string, DialogGraph>;
	characters: Character[];
	gameState: PlaytestState;
	flowNodeId: string | null;
	dialogPlayer: DialoguePlayer | null;
	finished: boolean;
};

function flowStartId(flow: FlowGraph): string | null {
	const start = flow.nodes.find((n) => n.type === 'start');
	if (!start) return null;
	return singleNextTarget(flow.edges, start.id);
}

export function createSequencePlayer(
	flow: FlowGraph,
	dialogs: Record<string, DialogGraph>,
	characters: Character[],
	properties: GameStateProperty[] = [],
): SequencePlayer {
	const start = flowStartId(flow);
	return {
		flow,
		dialogs,
		characters,
		gameState: defaultPlaytestState(),
		flowNodeId: start,
		dialogPlayer: null,
		finished: !start,
	};
}

export function getSequenceStep(player: SequencePlayer): SequenceStep | null {
	if (!player.flowNodeId || player.finished) return null;
	const node = nodeById(player.flow.nodes, player.flowNodeId);
	if (!node) return null;

	if (node.type === 'scene') {
		return {
			kind: 'scene',
			flowNodeId: node.id,
			label: node.data.label || node.data.dialogId || node.id,
			dialogId: node.data.dialogId ?? '',
		};
	}

	if (node.type === 'branch') {
		return {
			kind: 'branch',
			flowNodeId: node.id,
			label: node.data.label || node.id,
			options: (node.data.options ?? []).map((opt) => ({
				id: opt.id,
				label: opt.label,
			})),
		};
	}

	if (node.type === 'end') {
		return { kind: 'end', flowNodeId: node.id };
	}

	return null;
}

export function beginSceneDialogue(
	player: SequencePlayer,
	properties: GameStateProperty[] = [],
): { player: SequencePlayer; step: DialogueStep | null } {
	const seqStep = getSequenceStep(player);
	if (!seqStep || seqStep.kind !== 'scene' || !seqStep.dialogId) {
		return { player, step: null };
	}
	const graph = player.dialogs[seqStep.dialogId];
	if (!graph) return { player, step: null };
	const dialogPlayer = createDialoguePlayer(graph, player.characters, player.gameState);
	const result = advanceDialogue(dialogPlayer);
	return {
		player: {
			...player,
			dialogPlayer: result.player,
		},
		step: result.step,
	};
}

export function advanceSequenceFlow(
	player: SequencePlayer,
	branchOptionId?: string,
	properties: GameStateProperty[] = [],
): SequencePlayer {
	if (!player.flowNodeId) return { ...player, finished: true };

	const node = nodeById(player.flow.nodes, player.flowNodeId);
	if (!node) return { ...player, finished: true };

	if (node.type === 'branch') {
		const next =
			(branchOptionId && getOutgoing(player.flow.edges, node.id).find(
				(e) => e.sourceHandle === branchOptionId,
			)?.target) ||
			getOutgoing(player.flow.edges, node.id)[0]?.target ||
			null;
		return {
			...player,
			flowNodeId: next,
			dialogPlayer: null,
			finished: !next,
		};
	}

	const next = singleNextTarget(player.flow.edges, node.id);
	return {
		...player,
		flowNodeId: next,
		dialogPlayer: null,
		finished: !next,
	};
}

export function continueSceneDialogue(
	player: SequencePlayer,
	choiceOptionId?: string,
): { player: SequencePlayer; step: DialogueStep | null; sceneFinished: boolean } {
	if (!player.dialogPlayer) {
		return { player, step: null, sceneFinished: false };
	}
	const result = advanceDialogue(player.dialogPlayer, choiceOptionId);
	let nextPlayer = { ...player, dialogPlayer: result.player };
	if (result.player.finished) {
		nextPlayer = advanceSequenceFlow(nextPlayer);
		return { player: nextPlayer, step: result.step, sceneFinished: true };
	}
	return { player: nextPlayer, step: result.step, sceneFinished: false };
}
