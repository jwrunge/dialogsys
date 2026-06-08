import fs from 'node:fs/promises';
import path from 'node:path';
import { createDefaultFlowGraph } from '../../flow/flowFactory';
import {
	createProjectInputSchema,
	type ProjectMeta,
	projectMetaSchema,
} from '../../schema/project';
import { createSyncProject, ensureSyncOrigin } from '../../sync/client';
import { getClientId, setActiveOriginId } from '../client';
import { projectDir } from '../paths';
import { getProjectsRoot } from '../settings';
import { ensureDir, isRemoteStorage, readJsonFile, writeJsonFile, writeTextFile } from '../storage';

export async function touchProject(slug: string): Promise<void> {
	const meta = await getProject(slug);
	const updated = {
		...meta,
		updatedAt: new Date().toISOString(),
	};
	await writeJsonFile(slug, ['project.json'], updated);
}

async function scaffoldProjectFiles(slug: string, meta: ProjectMeta): Promise<void> {
	await ensureDir(slug);
	await ensureDir(slug, 'dialogs');
	await ensureDir(slug, 'sequences');
	await ensureDir(slug, 'portraits');
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

export async function listProjects(): Promise<ProjectMeta[]> {
	if (isRemoteStorage()) {
		const { getSyncCredentials } = await import('../sync-credentials');
		const { listSyncProjects } = await import('../../sync/client');
		return listSyncProjects(getSyncCredentials());
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
	if (!raw) throw new Error('Project not found');
	return projectMetaSchema.parse(raw);
}

export async function createProject(input: {
	slug: string;
	displayName: string;
	description?: string;
}): Promise<ProjectMeta> {
	const parsed = createProjectInputSchema.parse(input);

	if (isRemoteStorage()) {
		const { getSyncCredentials } = await import('../sync-credentials');
		const credentials = getSyncCredentials();
		const remoteMeta = await createSyncProject(credentials, {
			slug: parsed.slug,
			displayName: parsed.displayName,
			description: parsed.description,
		});
		const clientId = getClientId();
		await ensureSyncOrigin(credentials, parsed.slug, clientId);
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

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tmp = `${filePath}.${Date.now()}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
	await fs.rename(tmp, filePath);
}
