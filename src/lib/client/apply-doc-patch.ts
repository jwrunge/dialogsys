import { applyCharactersPatchOps } from '../characters/patch';
import { applyFlowPatchOps } from '../flow/patch';
import { applyGameStatePatchOps } from '../game-state/patch';
import { applyGraphPatchOps } from '../graph/patch';
import { applyNotePatchOps } from '../notes/patch';
import type { CharactersFile } from '../schema/characters';
import type { CharactersPatchOp } from '../schema/characters-patch';
import type { FlowGraph } from '../schema/flow';
import type { FlowPatchOp } from '../schema/flow-patch';
import type { GameStatePatchOp } from '../schema/game-state-patch';
import type { GameStateFile } from '../schema/gameState';
import type { DialogGraph } from '../schema/graph';
import type { GraphPatchOp } from '../schema/graph-patch';
import type { NotePatchOp } from '../schema/note-patch';
import type { CoauthorGraphPatch } from '../sync/realtime';
import {
	applyCharactersPatchWithMerge,
	applyGameStatePatchWithMerge,
	applyNotePatchWithMerge,
	applyScenePatchWithMerge,
	applySequencePatchWithMerge,
	type MergedPatchResult,
} from '../collaboration/patch-merge';
import {
	charactersFilePath,
	gameStateFilePath,
	noteFilePath,
	sceneGraphPath,
	sequenceGraphPath,
} from './coauthor-focus';

export {
	applyCharactersPatchWithMerge,
	applyGameStatePatchWithMerge,
	applyNotePatchWithMerge,
	applyScenePatchWithMerge,
	applySequencePatchWithMerge,
	type MergedPatchResult,
};

export function isSceneGraphPath(path: string, sceneId: string): boolean {
	return path === sceneGraphPath(sceneId);
}

export function isSequenceGraphPath(path: string, sequenceId: string): boolean {
	return path === sequenceGraphPath(sequenceId);
}

export function isCharactersPath(path: string): boolean {
	return path === charactersFilePath();
}

export function isNotePath(path: string, notePath: string): boolean {
	return path === noteFilePath(notePath);
}

export function isGameStatePath(path: string): boolean {
	return path === gameStateFilePath();
}

export function applyScenePatch(graph: DialogGraph, patch: CoauthorGraphPatch): DialogGraph {
	return applyGraphPatchOps(graph, patch.ops as GraphPatchOp[]);
}

export function applySequencePatch(graph: FlowGraph, patch: CoauthorGraphPatch): FlowGraph {
	return applyFlowPatchOps(graph, patch.ops as FlowPatchOp[]);
}

export function applyCharactersPatch(data: CharactersFile, patch: CoauthorGraphPatch): CharactersFile {
	return applyCharactersPatchOps(data, patch.ops as CharactersPatchOp[]);
}

export function applyNotePatch(content: string, patch: CoauthorGraphPatch): string {
	return applyNotePatchOps(content, patch.ops as NotePatchOp[]);
}

export function applyGameStatePatch(data: GameStateFile, patch: CoauthorGraphPatch): GameStateFile {
	return applyGameStatePatchOps(data, patch.ops as GameStatePatchOp[]);
}
