import fs from 'node:fs/promises';
import path from 'node:path';
import { projectMetaSchema, type ProjectMeta, createProjectInputSchema } from '../schema/project';
import { charactersFileSchema, type CharactersFile } from '../schema/characters';
import { variablesFileSchema, type VariablesFile } from '../schema/variables';
import { dialogGraphSchema, type DialogGraph } from '../schema/graph';

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
	await ensureDir(projectFilePath(parsed.slug, 'notes', 'direction'));
	await ensureDir(projectFilePath(parsed.slug, 'export', 'godot', 'dialogs'));

	await writeJsonAtomic(projectFilePath(parsed.slug, 'project.json'), meta);
	await writeJsonAtomic(projectFilePath(parsed.slug, 'characters.json'), { characters: [] });
	await writeJsonAtomic(projectFilePath(parsed.slug, 'variables.json'), {
		global: [],
		perCharacter: [],
	});
	await fs.writeFile(
		projectFilePath(parsed.slug, 'notes', 'overview.md'),
		`# ${parsed.displayName}\n\nProject overview notes.\n`,
		'utf-8',
	);

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
	return parsed;
}

export async function getVariables(slug: string): Promise<VariablesFile> {
	const file = projectFilePath(slug, 'variables.json');
	const raw = await readJsonFile(file, { global: [], perCharacter: [] });
	return variablesFileSchema.parse(raw);
}

export async function saveVariables(slug: string, data: VariablesFile): Promise<VariablesFile> {
	const parsed = variablesFileSchema.parse(data);
	await writeJsonAtomic(projectFilePath(slug, 'variables.json'), parsed);
	await touchProject(slug);
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
}

export async function listDirectionNotes(slug: string): Promise<string[]> {
	const dir = projectFilePath(slug, 'notes', 'direction');
	await ensureDir(dir);
	const files = await fs.readdir(dir);
	return files.filter((f) => f.endsWith('.md')).sort();
}

export async function listDialogs(slug: string): Promise<{ id: string; displayName: string }[]> {
	const dir = projectFilePath(slug, 'dialogs');
	await ensureDir(dir);
	const files = await fs.readdir(dir);
	const results: { id: string; displayName: string }[] = [];

	for (const file of files) {
		if (!file.endsWith('.graph.json')) continue;
		const id = file.replace(/\.graph\.json$/, '');
		try {
			const graph = await getDialog(slug, id);
			results.push({ id, displayName: graph.displayName });
		} catch {
			results.push({ id, displayName: id });
		}
	}

	return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getDialog(slug: string, id: string): Promise<DialogGraph> {
	assertSafeRelative(id);
	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	const raw = await readJsonFile(file, null);
	if (!raw) throw new Error('Dialog not found');
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
	return parsed;
}

export async function createDialog(
	slug: string,
	id: string,
	displayName: string,
): Promise<DialogGraph> {
	assertSafeRelative(id);
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid dialog id');

	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	try {
		await fs.access(file);
		throw new Error('Dialog already exists');
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

	return saveDialog(slug, graph);
}

export async function deleteDialog(slug: string, id: string): Promise<void> {
	const file = projectFilePath(slug, 'dialogs', `${id}.graph.json`);
	await fs.unlink(file);
	await touchProject(slug);
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
