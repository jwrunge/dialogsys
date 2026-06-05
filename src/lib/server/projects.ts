import fs from 'node:fs/promises';
import path from 'node:path';
import { projectMetaSchema, type ProjectMeta, createProjectInputSchema } from '../schema/project';
import { charactersFileSchema, type CharactersFile } from '../schema/characters';
import { dialogGraphSchema, type DialogGraph } from '../schema/graph';
import { flowGraphSchema, type FlowGraph } from '../schema/flow';
import {
	gameStateFileSchema,
	normalizeGameStateFile,
	type GameStateFile,
} from '../schema/gameState';
import { createDefaultFlowGraph } from '../flow/flowFactory';
import { ensureProjectRepo, scheduleSnapshot } from './versioning';

const DEFAULT_ROOT = './projects';

export function getProjectsRoot(): string {
	const root = process.env.DIALOGSYS_PROJECTS_ROOT ?? DEFAULT_ROOT;
	return path.resolve(process.cwd(), root);
}

function assertSafeSlug(slug: string): void {
	if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
		throw new Error('Invalid project slug');
	}
}

export function projectDir(slug: string): string {
	assertSafeSlug(slug);
	const dir = path.resolve(getProjectsRoot(), slug);
	const root = path.resolve(getProjectsRoot());
	if (!dir.startsWith(root + path.sep) && dir !== root) {
		throw new Error('Path traversal denied');
	}
	return dir;
}

function assertSafeRelative(rel: string): void {
	const normalized = path.normalize(rel);
	if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
		throw new Error('Invalid path');
	}
}

export function projectFilePath(slug: string, ...segments: string[]): string {
	segments.forEach(assertSafeRelative);
	const dir = projectDir(slug);
	const file = path.resolve(dir, ...segments);
	if (!file.startsWith(dir + path.sep) && file !== dir) {
		throw new Error('Path traversal denied');
	}
	return file;
}

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		return JSON.parse(raw) as T;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
			return fallback;
		}
		throw e;
	}
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
	await ensureDir(path.dirname(filePath));
	const tmp = `${filePath}.${Date.now()}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
	await fs.rename(tmp, filePath);
}

export async function listProjects(): Promise<ProjectMeta[]> {
	const root = getProjectsRoot();
	await ensureDir(root);
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
	const file = projectFilePath(slug, 'project.json');
	const raw = await readJsonFile(file, null);
	return projectMetaSchema.parse(raw);
}

export async function createProject(input: {
	slug: string;
	displayName: string;
	description?: string;
}): Promise<ProjectMeta> {
	const parsed = createProjectInputSchema.parse(input);
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

	await ensureDir(dir);
	await ensureDir(projectFilePath(parsed.slug, 'dialogs'));
	await ensureDir(projectFilePath(parsed.slug, 'export', 'godot', 'dialogs'));

	await writeJsonAtomic(projectFilePath(parsed.slug, 'project.json'), meta);
	await writeJsonAtomic(projectFilePath(parsed.slug, 'characters.json'), { characters: [] });
	await writeJsonAtomic(projectFilePath(parsed.slug, 'gameState.json'), { properties: [] });
	await fs.writeFile(
		projectFilePath(parsed.slug, 'notes', 'overview.md'),
		`# ${parsed.displayName}\n\nProject overview notes.\n`,
		'utf-8',
	);

	try {
		await ensureProjectRepo(parsed.slug);
		await scheduleSnapshot(parsed.slug, 'project created', { immediate: true });
	} catch {
		/* project works without git; History page shows install prompt */
	}

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
	await writeJsonAtomic(projectFilePath(slug, 'project.json'), updated);
	void scheduleSnapshot(slug, 'project metadata updated');
	return updated;
}

export async function getCharacters(slug: string): Promise<CharactersFile> {
	const file = projectFilePath(slug, 'characters.json');
	const raw = await readJsonFile(file, { characters: [] });
	return charactersFileSchema.parse(raw);
}

export async function saveCharacters(slug: string, data: CharactersFile): Promise<CharactersFile> {
	const parsed = charactersFileSchema.parse(data);
	await writeJsonAtomic(projectFilePath(slug, 'characters.json'), parsed);
	await touchProject(slug);
	await scheduleSnapshot(slug, 'characters saved', { immediate: true });
	return parsed;
}

export async function readNote(slug: string, notePath: string): Promise<string> {
	const file = projectFilePath(slug, 'notes', notePath);
	try {
		return await fs.readFile(file, 'utf-8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return '';
		throw e;
	}
}

export async function writeNote(slug: string, notePath: string, content: string): Promise<void> {
	assertSafeRelative(notePath);
	if (!notePath.endsWith('.md')) throw new Error('Notes must be .md files');
	const file = projectFilePath(slug, 'notes', notePath);
	await ensureDir(path.dirname(file));
	await fs.writeFile(file, content, 'utf-8');
	await touchProject(slug);
	await scheduleSnapshot(slug, `notes: ${notePath}`);
}

export type DialogListItem = {
	id: string;
	displayName: string;
	description: string;
	stepCount: number;
};

export async function listDialogs(slug: string): Promise<DialogListItem[]> {
	const dir = projectFilePath(slug, 'dialogs');
	await ensureDir(dir);
	const files = await fs.readdir(dir);
	const results: DialogListItem[] = [];

	for (const file of files) {
		if (!file.endsWith('.graph.json')) continue;
		const id = file.replace(/\.graph\.json$/, '');
		try {
			const graph = await getDialog(slug, id);
			results.push({
				id,
				displayName: graph.displayName,
				description: graph.description ?? '',
				stepCount: graph.nodes.filter(
					(n) => n.type !== 'entry' && n.type !== 'blank',
				).length,
			});
		} catch {
			results.push({ id, displayName: id, description: '', stepCount: 0 });
		}
	}

	return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getDialog(slug: string, id: string): Promise<DialogGraph> {
	assertSafeRelative(id);
	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	const raw = await readJsonFile(file, null);
	if (!raw) throw new Error('Scene not found');
	return dialogGraphSchema.parse(raw);
}

export async function saveDialog(slug: string, graph: DialogGraph): Promise<DialogGraph> {
	const parsed = dialogGraphSchema.parse({
		...graph,
		updatedAt: new Date().toISOString(),
	});
	await writeJsonAtomic(
		projectFilePath(slug, 'dialogs', `${parsed.id}.graph.json`),
		parsed,
	);
	await touchProject(slug);
	void scheduleSnapshot(slug, `dialog saved: ${parsed.id}`);
	return parsed;
}

export async function createDialog(
	slug: string,
	id: string,
	displayName: string,
): Promise<DialogGraph> {
	assertSafeRelative(id);
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid scene id');

	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	try {
		await fs.access(file);
		throw new Error('Scene already exists');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
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

	const saved = await saveDialog(slug, graph);
	void scheduleSnapshot(slug, `dialog created: ${id}`, { immediate: true });
	return saved;
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

export async function clearDialogFromFlow(slug: string, dialogId: string): Promise<number> {
	const flow = await getFlow(slug);
	let count = 0;
	let changed = false;
	const nodes = flow.nodes.map((node) => {
		if (node.type !== 'scene' || node.data.dialogId !== dialogId) return node;
		count++;
		changed = true;
		const nextData = { ...node.data };
		delete nextData.dialogId;
		delete nextData.firstMeetings;
		return { ...node, data: nextData };
	});
	if (changed) {
		await saveFlow(slug, { ...flow, nodes });
	}
	return count;
}

export async function deleteDialog(slug: string, id: string): Promise<{ flowNodesCleared: number }> {
	const flowNodesCleared = await clearDialogFromFlow(slug, id);
	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	await fs.unlink(file);
	await touchProject(slug);
	void scheduleSnapshot(slug, `dialog deleted: ${id}`, { immediate: true });
	return { flowNodesCleared };
}

export async function getFlow(slug: string): Promise<FlowGraph> {
	const file = projectFilePath(slug, 'flow.graph.json');
	const raw = await readJsonFile(file, null);
	if (!raw) {
		const graph = createDefaultFlowGraph();
		await saveFlow(slug, graph);
		return graph;
	}
	return flowGraphSchema.parse(raw);
}

export async function getGameState(slug: string): Promise<GameStateFile> {
	const file = projectFilePath(slug, 'gameState.json');
	const raw = await readJsonFile(file, { properties: [] });
	return normalizeGameStateFile(gameStateFileSchema.parse(raw));
}

export async function saveGameState(slug: string, data: GameStateFile): Promise<GameStateFile> {
	const parsed = normalizeGameStateFile(gameStateFileSchema.parse(data));
	await writeJsonAtomic(projectFilePath(slug, 'gameState.json'), parsed);
	await touchProject(slug);
	await scheduleSnapshot(slug, 'game state saved', { immediate: true });
	return parsed;
}

export async function saveFlow(slug: string, graph: FlowGraph): Promise<FlowGraph> {
	const parsed = flowGraphSchema.parse({
		...graph,
		updatedAt: new Date().toISOString(),
	});
	await writeJsonAtomic(projectFilePath(slug, 'flow.graph.json'), parsed);
	await touchProject(slug);
	void scheduleSnapshot(slug, 'flow saved');
	return parsed;
}

async function touchProject(slug: string): Promise<void> {
	const meta = await getProject(slug);
	await writeJsonAtomic(projectFilePath(slug, 'project.json'), {
		...meta,
		updatedAt: new Date().toISOString(),
	});
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
