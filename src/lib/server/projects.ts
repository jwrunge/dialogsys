import fs from 'node:fs/promises';
import path from 'node:path';
import { projectMetaSchema, type ProjectMeta, createProjectInputSchema } from '../schema/project';
import { charactersFileSchema, type CharactersFile } from '../schema/characters';
import { dialogGraphSchema, type DialogGraph } from '../schema/graph';
import {
	flowGraphSchema,
	type FlowGraph,
	type SceneSequenceUsage,
	type SequenceListItem,
} from '../schema/flow';
import {
	gameStateFileSchema,
	normalizeGameStateFile,
	type GameStateFile,
} from '../schema/gameState';
import { createDefaultFlowGraph } from '../flow/flowFactory';
import { getProjectsRoot, getAppSettingsInfo } from './settings';
import { getClientId, setActiveOriginId } from './client';
import { projectDir, projectFilePath } from './paths';
import {
	isRemoteStorage,
	readJsonFile,
	writeJsonFile,
	readTextFile,
	writeTextFile,
	ensureDir,
	listDir,
	fileExists,
	deleteFile,
} from './storage';
import { createSyncProject, ensureSyncOrigin } from '../sync/client';
import { pushFileToOrigin } from './sync-remote';

export { getProjectsRoot } from './settings';
export { projectDir, projectFilePath } from './paths';

function assertSafeRelative(rel: string): void {
	const normalized = path.normalize(rel);
	if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
		throw new Error('Invalid path');
	}
}

export async function listProjects(): Promise<ProjectMeta[]> {
	if (isRemoteStorage()) {
		const { syncServerUrl } = getAppSettingsInfo();
		const { listSyncProjects } = await import('../sync/client');
		return listSyncProjects(syncServerUrl);
	}

	const root = getProjectsRoot();
	await fs.mkdir(root, { recursive: true });
	const entries = await fs.readdir(root, { withFileTypes: true });
	const projects: ProjectMeta[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		try {
			const meta = await getProject(entry.name);
			projects.push(meta);
		} catch {
			// skip invalid folders
		}
	}

	return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(slug: string): Promise<ProjectMeta> {
	const raw = await readJsonFile(slug, ['project.json'], null);
	return projectMetaSchema.parse(raw);
}

async function scaffoldProjectFiles(slug: string, meta: ProjectMeta): Promise<void> {
	await ensureDir(slug);
	await ensureDir(slug, 'dialogs');
	await ensureDir(slug, 'sequences');
	await ensureDir(slug, 'export', 'godot', 'dialogs');
	await writeJsonFile(slug, ['sequences', 'main.graph.json'], createDefaultFlowGraph());
	await writeJsonFile(slug, ['project.json'], meta);
	await writeJsonFile(slug, ['characters.json'], { characters: [] });
	await writeJsonFile(slug, ['gameState.json'], { properties: [] });
	await writeTextFile(
		slug,
		['notes', 'overview.md'],
		`# ${meta.displayName}\n\nProject overview notes.\n`,
	);
}

export async function createProject(input: {
	slug: string;
	displayName: string;
	description?: string;
}): Promise<ProjectMeta> {
	const parsed = createProjectInputSchema.parse(input);

	if (isRemoteStorage()) {
		const { syncServerUrl } = getAppSettingsInfo();
		const remoteMeta = await createSyncProject(syncServerUrl, {
			slug: parsed.slug,
			displayName: parsed.displayName,
			description: parsed.description,
		});
		const clientId = getClientId();
		await ensureSyncOrigin(syncServerUrl, parsed.slug, clientId);
		await setActiveOriginId(parsed.slug, clientId);
		await scaffoldProjectFiles(parsed.slug, remoteMeta);
		return remoteMeta;
	}

	const dir = projectDir(parsed.slug);
	try {
		await fs.access(dir);
		throw new Error('Project already exists');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
	}

	const now = new Date().toISOString();
	const meta: ProjectMeta = {
		slug: parsed.slug,
		displayName: parsed.displayName,
		description: parsed.description ?? '',
		createdAt: now,
		updatedAt: now,
	};

	await scaffoldProjectFiles(parsed.slug, meta);
	return meta;
}

export async function updateProject(
	slug: string,
	patch: Partial<Pick<ProjectMeta, 'displayName' | 'description'>>,
): Promise<ProjectMeta> {
	const meta = await getProject(slug);
	const updated: ProjectMeta = {
		...meta,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	await writeJsonFile(slug, ['project.json'], updated);
	return updated;
}

export async function getCharacters(slug: string): Promise<CharactersFile> {
	const raw = await readJsonFile(slug, ['characters.json'], { characters: [] });
	return charactersFileSchema.parse(raw);
}

export async function saveCharacters(slug: string, data: CharactersFile): Promise<CharactersFile> {
	const parsed = charactersFileSchema.parse(data);
	await writeJsonFile(slug, ['characters.json'], parsed);
	await touchProject(slug);
	return parsed;
}

export async function readNote(slug: string, notePath: string): Promise<string> {
	assertSafeRelative(notePath);
	return readTextFile(slug, 'notes', notePath);
}

export async function writeNote(slug: string, notePath: string, content: string): Promise<void> {
	assertSafeRelative(notePath);
	if (!notePath.endsWith('.md')) throw new Error('Notes must be .md files');
	await writeTextFile(slug, ['notes', notePath], content);
	await touchProject(slug);
}

export type DialogListItem = {
	id: string;
	displayName: string;
	description: string;
	stepCount: number;
	nodeCount: number;
	sequenceCount: number;
};

export type { SceneSequenceUsage, SequenceListItem };

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
				stepCount: graph.nodes.filter(
					(n) => n.type !== 'entry' && n.type !== 'blank',
				).length,
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

export async function saveDialog(slug: string, graph: DialogGraph): Promise<DialogGraph> {
	const parsed = dialogGraphSchema.parse({
		...graph,
		updatedAt: new Date().toISOString(),
	});
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

	return saveDialog(slug, graph);
}

export async function updateDialogMeta(
	slug: string,
	id: string,
	patch: Partial<Pick<DialogGraph, 'displayName' | 'description'>>,
): Promise<DialogGraph> {
	const graph = await getDialog(slug, id);
	return saveDialog(slug, {
		...graph,
		...patch,
	});
}

function assertSequenceId(id: string): void {
	assertSafeRelative(id);
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid sequence id');
}

function sequenceSegments(id: string): string[] {
	assertSequenceId(id);
	return ['sequences', `${id}.graph.json`];
}

async function readLegacyFlow(slug: string): Promise<FlowGraph | null> {
	const raw = await readJsonFile(slug, ['flow.graph.json'], null);
	if (!raw) return null;
	return flowGraphSchema.parse(raw);
}

async function loadAllSequences(slug: string): Promise<FlowGraph[]> {
	const sequences = await listSequences(slug);
	if (sequences.length === 0) return [];
	return Promise.all(sequences.map((s) => getSequence(slug, s.id)));
}

export async function getSceneUsageStats(
	slug: string,
): Promise<Record<string, SceneUsageStats>> {
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

export async function listSequences(slug: string): Promise<SequenceListItem[]> {
	await ensureDir(slug, 'sequences');
	const files = await listDir(slug, 'sequences');
	const results: SequenceListItem[] = [];

	for (const file of files) {
		if (!file.endsWith('.graph.json')) continue;
		const id = file.replace(/\.graph\.json$/, '');
		try {
			const graph = await getSequence(slug, id);
			results.push({
				id,
				displayName: graph.displayName,
				updatedAt: graph.updatedAt ?? '',
			});
		} catch {
			results.push({ id, displayName: id, updatedAt: '' });
		}
	}

	if (results.length === 0) {
		const legacy = await readLegacyFlow(slug);
		if (legacy) {
			results.push({
				id: legacy.id || 'main',
				displayName: legacy.displayName,
				updatedAt: legacy.updatedAt ?? '',
			});
		}
	}

	return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getSequence(slug: string, id: string): Promise<FlowGraph> {
	const raw = await readJsonFile(slug, sequenceSegments(id), null);
	if (raw) {
		const graph = flowGraphSchema.parse(raw);
		return { ...graph, id };
	}

	if (id === 'main') {
		const legacy = await readLegacyFlow(slug);
		if (legacy) return { ...legacy, id: legacy.id || 'main' };
	}

	const graph = createDefaultFlowGraph(id);
	await saveSequence(slug, graph);
	return graph;
}

export async function saveSequence(slug: string, graph: FlowGraph): Promise<FlowGraph> {
	assertSequenceId(graph.id);
	const parsed = flowGraphSchema.parse({
		...graph,
		updatedAt: new Date().toISOString(),
	});
	await writeJsonFile(slug, sequenceSegments(parsed.id), parsed);
	await touchProject(slug);
	return parsed;
}

export async function createSequence(
	slug: string,
	input: { id: string; displayName: string },
): Promise<FlowGraph> {
	assertSequenceId(input.id);
	if (await fileExists(slug, ...sequenceSegments(input.id))) {
		throw new Error('Sequence already exists');
	}

	const graph = createDefaultFlowGraph(input.id, input.displayName.trim());
	return saveSequence(slug, graph);
}

export async function deleteSequence(slug: string, id: string): Promise<void> {
	if (id === 'main') throw new Error('Cannot delete the main sequence');
	await deleteFile(slug, ...sequenceSegments(id));
	await touchProject(slug);
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
			await saveSequence(slug, { ...graph, nodes });
			total += count;
		}
	}

	return total;
}

export async function deleteDialog(slug: string, id: string): Promise<{ flowNodesCleared: number }> {
	const flowNodesCleared = await clearDialogFromSequences(slug, id);
	await deleteFile(slug, 'dialogs', `${id}.graph.json`);
	await touchProject(slug);
	return { flowNodesCleared };
}

export async function getGameState(slug: string): Promise<GameStateFile> {
	const raw = await readJsonFile(slug, ['gameState.json'], { properties: [] });
	return normalizeGameStateFile(gameStateFileSchema.parse(raw));
}

export async function saveGameState(slug: string, data: GameStateFile): Promise<GameStateFile> {
	const parsed = normalizeGameStateFile(gameStateFileSchema.parse(data));
	await writeJsonFile(slug, ['gameState.json'], parsed);
	await touchProject(slug);
	return parsed;
}

async function touchProject(slug: string): Promise<void> {
	const meta = await getProject(slug);
	const updated = {
		...meta,
		updatedAt: new Date().toISOString(),
	};
	await writeJsonFile(slug, ['project.json'], updated);
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tmp = `${filePath}.${Date.now()}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
	await fs.rename(tmp, filePath);
}

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function errorResponse(message: string, status = 400): Response {
	return jsonResponse({ error: message }, status);
}
