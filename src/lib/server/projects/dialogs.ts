import { hashDialogGraph } from '../../graph/content-hash';
import { applyGraphPatchOps } from '../../graph/patch';
import type { FlowGraph, SceneSequenceUsage } from '../../schema/flow';
import type { CharactersFile } from '../../schema/characters';
import { type DialogGraph, dialogGraphSchema } from '../../schema/graph';
import type { GameStateFile } from '../../schema/gameState';
import type { GraphPatchOp } from '../../schema/graph-patch';
import { getActiveOriginId } from '../client';
import { publishGraphPatch } from '../collaboration/realtime-publish';
import { getClientId } from '../config-file';
import { assertSafeRelative } from '../paths';
import { getDeviceDisplayName } from '../settings';
import {
	deleteFile,
	ensureDir,
	fileExists,
	listDir,
	readJsonFile,
	writeJsonFile,
} from '../storage';
import { touchProject } from './meta';
import { getSequence, listSequences, saveSequence } from './sequences';

export type DialogListItem = {
	id: string;
	displayName: string;
	description: string;
	stepCount: number;
	nodeCount: number;
	sequenceCount: number;
};

export type SceneUsageStats = {
	nodeCount: number;
	sequenceCount: number;
};

export async function listDialogs(slug: string): Promise<DialogListItem[]> {
	await ensureDir(slug, 'dialogs');
	const files = await listDir(slug, 'dialogs');
	const usage = await getSceneUsageStats(slug);
	const results: DialogListItem[] = [];

	for (const file of files) {
		if (!file.endsWith('.graph.json')) continue;
		const id = file.replace(/\.graph\.json$/, '');
		const stats = usage[id] ?? { nodeCount: 0, sequenceCount: 0 };
		try {
			const graph = await getDialog(slug, id);
			results.push({
				id,
				displayName: graph.displayName,
				description: graph.description ?? '',
				stepCount: graph.nodes.filter((n) => n.type !== 'entry' && n.type !== 'blank').length,
				nodeCount: stats.nodeCount,
				sequenceCount: stats.sequenceCount,
			});
		} catch {
			results.push({
				id,
				displayName: id,
				description: '',
				stepCount: 0,
				nodeCount: stats.nodeCount,
				sequenceCount: stats.sequenceCount,
			});
		}
	}

	return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getDialog(slug: string, id: string): Promise<DialogGraph> {
	assertSafeRelative(id);
	const raw = await readJsonFile(slug, ['dialogs', `${id}.graph.json`], null);
	if (!raw) throw new Error('Scene not found');
	return dialogGraphSchema.parse(raw);
}

export class GraphPatchConflictError extends Error {
	constructor(
		message: string,
		readonly currentContentHash: string,
		readonly graph?: DialogGraph | FlowGraph,
		readonly characters?: CharactersFile,
		readonly noteContent?: string,
		readonly gameState?: GameStateFile,
		readonly path?: string,
	) {
		super(message);
		this.name = 'GraphPatchConflictError';
	}
}

export async function applyDialogGraphPatch(
	slug: string,
	id: string,
	baseContentHash: string,
	ops: GraphPatchOp[],
): Promise<{ graph: DialogGraph; contentHash: string }> {
	const current = await getDialog(slug, id);
	const currentHash = hashDialogGraph(current);
	if (baseContentHash !== currentHash) {
		throw new GraphPatchConflictError(
			'Scene changed since baseContentHash',
			currentHash,
			current,
			undefined,
			undefined,
			undefined,
			`dialogs/${id}.graph.json`,
		);
	}

	const patched = dialogGraphSchema.parse(applyGraphPatchOps(current, ops));
	const saved = await saveDialog(slug, id, patched);
	const contentHash = hashDialogGraph(saved);

	await publishGraphPatch(slug, {
		deviceId: getClientId(),
		displayName: getDeviceDisplayName() || 'This device',
		originId: getActiveOriginId(slug),
		path: `dialogs/${id}.graph.json`,
		baseContentHash,
		contentHash,
		ops,
	});

	return { graph: saved, contentHash };
}

export async function getDialogWithHash(
	slug: string,
	id: string,
): Promise<{ graph: DialogGraph; contentHash: string }> {
	const graph = await getDialog(slug, id);
	return { graph, contentHash: hashDialogGraph(graph) };
}

export async function saveDialog(
	slug: string,
	expectedId: string,
	graph: DialogGraph,
): Promise<DialogGraph> {
	assertSafeRelative(expectedId);
	const parsed = dialogGraphSchema.parse({
		...graph,
		id: expectedId,
		updatedAt: new Date().toISOString(),
	});
	if (parsed.id !== expectedId) {
		throw new Error('Graph id does not match URL');
	}
	await writeJsonFile(slug, ['dialogs', `${parsed.id}.graph.json`], parsed);
	await touchProject(slug);
	return parsed;
}

export async function createDialog(
	slug: string,
	id: string,
	displayName: string,
): Promise<DialogGraph> {
	assertSafeRelative(id);
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid scene id');

	if (await fileExists(slug, 'dialogs', `${id}.graph.json`)) {
		throw new Error('Scene already exists');
	}

	const graph: DialogGraph = {
		id,
		displayName,
		description: '',
		nodes: [
			{
				id: 'entry',
				type: 'entry',
				position: { x: 100, y: 200 },
				data: { label: 'Start' },
			},
			{
				id: 'end',
				type: 'end',
				position: { x: 400, y: 200 },
				data: { label: 'End' },
			},
		],
		edges: [{ id: 'e-entry-end', source: 'entry', target: 'end' }],
		updatedAt: new Date().toISOString(),
	};

	return saveDialog(slug, id, graph);
}

export async function updateDialogMeta(
	slug: string,
	id: string,
	patch: Partial<Pick<DialogGraph, 'displayName' | 'description'>>,
): Promise<DialogGraph> {
	const graph = await getDialog(slug, id);
	return saveDialog(slug, id, {
		...graph,
		...patch,
	});
}

async function loadAllSequences(slug: string) {
	const sequences = await listSequences(slug);
	if (sequences.length === 0) return [];
	return Promise.all(sequences.map((s) => getSequence(slug, s.id)));
}

export async function getSceneUsageStats(slug: string): Promise<Record<string, SceneUsageStats>> {
	const stats: Record<string, SceneUsageStats> = {};
	const sequences = await loadAllSequences(slug);

	for (const graph of sequences) {
		const dialogIdsInSequence = new Set<string>();
		for (const node of graph.nodes) {
			if (node.type !== 'scene' || !node.data.dialogId) continue;
			const dialogId = node.data.dialogId;
			dialogIdsInSequence.add(dialogId);
			if (!stats[dialogId]) stats[dialogId] = { nodeCount: 0, sequenceCount: 0 };
			stats[dialogId].nodeCount++;
		}
		for (const dialogId of dialogIdsInSequence) {
			stats[dialogId]!.sequenceCount++;
		}
	}

	return stats;
}

export async function getSceneSequenceUsage(
	slug: string,
	dialogId: string,
): Promise<SceneSequenceUsage[]> {
	const sequences = await loadAllSequences(slug);
	const counts = new Map<string, { displayName: string; nodeCount: number }>();

	for (const graph of sequences) {
		let nodeCount = 0;
		for (const node of graph.nodes) {
			if (node.type === 'scene' && node.data.dialogId === dialogId) nodeCount++;
		}
		if (nodeCount === 0) continue;
		counts.set(graph.id, {
			displayName: graph.displayName || graph.id,
			nodeCount,
		});
	}

	return [...counts.entries()]
		.map(([sequenceId, { displayName, nodeCount }]) => ({
			sequenceId,
			displayName,
			nodeCount,
		}))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function clearDialogFromSequences(slug: string, dialogId: string): Promise<number> {
	const sequences = await listSequences(slug);
	let total = 0;

	for (const { id } of sequences) {
		const graph = await getSequence(slug, id);
		let count = 0;
		let changed = false;
		const nodes = graph.nodes.map((node) => {
			if (node.type !== 'scene' || node.data.dialogId !== dialogId) return node;
			count++;
			changed = true;
			const nextData = { ...node.data };
			delete nextData.dialogId;
			delete nextData.firstMeetings;
			return { ...node, data: nextData };
		});
		if (changed) {
			await saveSequence(slug, id, { ...graph, nodes });
			total += count;
		}
	}

	return total;
}

export async function deleteDialog(
	slug: string,
	id: string,
): Promise<{ flowNodesCleared: number }> {
	const flowNodesCleared = await clearDialogFromSequences(slug, id);
	await deleteFile(slug, 'dialogs', `${id}.graph.json`);
	await touchProject(slug);
	return { flowNodesCleared };
}
