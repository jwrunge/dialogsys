import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { appSettingsSchema, type AppSettings } from '../schema/settings';

const DEFAULT_ROOT = './projects';
const CONFIG_FILENAME = 'dialogsys.config.json';

export type ProjectsRootSource = 'env' | 'config' | 'default';

export type ProjectsRootInfo = {
	/** Path stored in config (or default) — may be relative */
	configuredPath: string;
	/** Resolved absolute path used on disk */
	resolvedPath: string;
	source: ProjectsRootSource;
	/** True when DIALOGSYS_PROJECTS_ROOT is set */
	envOverride: boolean;
};

export function getConfigFilePath(): string {
	return path.resolve(process.cwd(), CONFIG_FILENAME);
}

function readConfigSync(): AppSettings {
	try {
		const raw = fs.readFileSync(getConfigFilePath(), 'utf-8');
		return appSettingsSchema.parse(JSON.parse(raw));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
		if (e instanceof SyntaxError) return {};
		throw e;
	}
}

export function resolveProjectsRoot(settings?: AppSettings): ProjectsRootInfo {
	const envRoot = process.env.DIALOGSYS_PROJECTS_ROOT?.trim();
	if (envRoot) {
		return {
			configuredPath: envRoot,
			resolvedPath: path.resolve(process.cwd(), envRoot),
			source: 'env',
			envOverride: true,
		};
	}

	const config = settings ?? readConfigSync();
	const configuredPath = config.projectsRoot?.trim() || DEFAULT_ROOT;
	return {
		configuredPath,
		resolvedPath: path.resolve(process.cwd(), configuredPath),
		source: config.projectsRoot ? 'config' : 'default',
		envOverride: false,
	};
}

export function getProjectsRoot(): string {
	return resolveProjectsRoot().resolvedPath;
}

export function getProjectsRootInfo(): ProjectsRootInfo {
	return resolveProjectsRoot();
}

export async function loadSettings(): Promise<AppSettings> {
	const file = getConfigFilePath();
	try {
		const raw = await fsPromises.readFile(file, 'utf-8');
		return appSettingsSchema.parse(JSON.parse(raw));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw e;
	}
}

export async function saveSettings(input: AppSettings): Promise<ProjectsRootInfo> {
	const parsed = appSettingsSchema.parse(input);
	if (!parsed.projectsRoot?.trim()) {
		throw new Error('Projects path is required');
	}

	const projectsRoot = parsed.projectsRoot.trim();
	if (path.isAbsolute(projectsRoot) && projectsRoot.includes('\0')) {
		throw new Error('Invalid projects path');
	}

	const file = getConfigFilePath();
	const data: AppSettings = { projectsRoot };
	const tmp = `${file}.${Date.now()}.tmp`;
	await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
	await fsPromises.rename(tmp, file);

	await fsPromises.mkdir(path.resolve(process.cwd(), projectsRoot), { recursive: true });

	return resolveProjectsRoot(data);
}
