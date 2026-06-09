import type { CharactersFile } from '../schema/characters';
import type { FlowGraph } from '../schema/flow';
import type { GameStateFile } from '../schema/gameState';
import type { DialogGraph } from '../schema/graph';
import type { CoauthorGraphPatch } from '../sync/realtime';
import { applyCharactersPatchOps } from '../characters/patch';
import { applyFlowPatchOps } from '../flow/patch';
import { applyGameStatePatchOps } from '../game-state/patch';
import { applyGraphPatchOps } from '../graph/patch';
import { applyNotePatchOps } from '../notes/patch';
import type { CharactersPatchOp } from '../schema/characters-patch';
import type { FlowPatchOp } from '../schema/flow-patch';
import type { GameStatePatchOp } from '../schema/game-state-patch';
import type { GraphPatchOp } from '../schema/graph-patch';
import type { NotePatchOp } from '../schema/note-patch';
import { mergeEntityList, mergeText, mergeValue } from './three-way-merge';

export type MergedPatchResult<T> = {
	value: T;
	staleBase: boolean;
};

function isStaleBase(patch: CoauthorGraphPatch, contentHash: string): boolean {
	return patch.baseContentHash !== contentHash;
}

export function mergeDialogGraph(
	ancestor: DialogGraph,
	local: DialogGraph,
	remote: DialogGraph,
): DialogGraph {
	return {
		...local,
		displayName: mergeValue(ancestor.displayName, local.displayName, remote.displayName),
		description: mergeValue(ancestor.description, local.description, remote.description),
		nodes: mergeEntityList(ancestor.nodes, local.nodes, remote.nodes),
		edges: mergeEntityList(ancestor.edges, local.edges, remote.edges),
	};
}

export function mergeFlowGraph(ancestor: FlowGraph, local: FlowGraph, remote: FlowGraph): FlowGraph {
	return {
		...local,
		displayName: mergeValue(ancestor.displayName, local.displayName, remote.displayName),
		nodes: mergeEntityList(ancestor.nodes, local.nodes, remote.nodes),
		edges: mergeEntityList(ancestor.edges, local.edges, remote.edges),
	};
}

export function mergeCharactersFile(
	ancestor: CharactersFile,
	local: CharactersFile,
	remote: CharactersFile,
): CharactersFile {
	return {
		characters: mergeEntityList(ancestor.characters, local.characters, remote.characters),
	};
}

export function mergeGameStateFile(
	ancestor: GameStateFile,
	local: GameStateFile,
	remote: GameStateFile,
): GameStateFile {
	return {
		properties: mergeEntityList(ancestor.properties, local.properties, remote.properties),
	};
}

export function applyScenePatchWithMerge(
	ancestor: DialogGraph,
	local: DialogGraph,
	patch: CoauthorGraphPatch,
	contentHash: string,
): MergedPatchResult<DialogGraph> {
	const staleBase = isStaleBase(patch, contentHash);
	const remote = applyGraphPatchOps(ancestor, patch.ops as GraphPatchOp[]);
	return {
		value: staleBase ? mergeDialogGraph(ancestor, local, remote) : remote,
		staleBase,
	};
}

export function applySequencePatchWithMerge(
	ancestor: FlowGraph,
	local: FlowGraph,
	patch: CoauthorGraphPatch,
	contentHash: string,
): MergedPatchResult<FlowGraph> {
	const staleBase = isStaleBase(patch, contentHash);
	const remote = applyFlowPatchOps(ancestor, patch.ops as FlowPatchOp[]);
	return {
		value: staleBase ? mergeFlowGraph(ancestor, local, remote) : remote,
		staleBase,
	};
}

export function applyCharactersPatchWithMerge(
	ancestor: CharactersFile,
	local: CharactersFile,
	patch: CoauthorGraphPatch,
	contentHash: string,
): MergedPatchResult<CharactersFile> {
	const staleBase = isStaleBase(patch, contentHash);
	const remote = applyCharactersPatchOps(ancestor, patch.ops as CharactersPatchOp[]);
	return {
		value: staleBase ? mergeCharactersFile(ancestor, local, remote) : remote,
		staleBase,
	};
}

export function applyGameStatePatchWithMerge(
	ancestor: GameStateFile,
	local: GameStateFile,
	patch: CoauthorGraphPatch,
	contentHash: string,
): MergedPatchResult<GameStateFile> {
	const staleBase = isStaleBase(patch, contentHash);
	const remote = applyGameStatePatchOps(ancestor, patch.ops as GameStatePatchOp[]);
	return {
		value: staleBase ? mergeGameStateFile(ancestor, local, remote) : remote,
		staleBase,
	};
}

export function applyNotePatchWithMerge(
	ancestor: string,
	local: string,
	patch: CoauthorGraphPatch,
	contentHash: string,
): MergedPatchResult<string> {
	const staleBase = isStaleBase(patch, contentHash);
	const remote = applyNotePatchOps(ancestor, patch.ops as NotePatchOp[]);
	return {
		value: staleBase ? mergeText(ancestor, local, remote) : remote,
		staleBase,
	};
}
