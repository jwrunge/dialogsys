import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
	appSettingsSchema,
	type AppSettings,
	type StorageMode,
} from '../schema/settings';
import { isValidSyncServerUrl } from '../sync/client';

const DEFAULT_ROOT = './projects';
const CONFIG_FILENAME = 'dialogsys.config.json';

export type ProjectsRootSource = 'env' | 'config' | 'default';

export type ProjectsRootInfo = {
	configuredPath: string;
	resolvedPath: string;
	source: ProjectsRootSource;
	envOverride: boolean;
};

export type AppSettingsInfo = {
	projectsRoot: string;
	resolvedPath: string;
	source: ProjectsRootSource;
	envOverride: boolean;
	storageMode: StorageMode;
	syncServerUrl: string;
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

export function getAppSettingsInfo(): AppSettingsInfo {
	const config = readConfigSync();
	const root = resolveProjectsRoot(config);
	return {
		projectsRoot: root.configuredPath,
		resolvedPath: root.resolvedPath,
		source: root.source,
		envOverride: root.envOverride,
		storageMode: config.storageMode ?? 'local',
		syncServerUrl: config.syncServerUrl?.trim() ?? '',
	};
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

function normalizeSettingsInput(input: AppSettings): AppSettings {
	const storageMode = input.storageMode ?? 'local';
	const projectsRoot = input.projectsRoot?.trim() || DEFAULT_ROOT;
	const syncServerUrl = input.syncServerUrl?.trim().replace(/\/+$/, '') ?? '';

	if (storageMode === 'remote') {
		if (!syncServerUrl) {
			throw new Error('Sync server URL is required for remote storage');
		}
		if (!isValidSyncServerUrl(syncServerUrl)) {
			throw new Error('Sync server URL must start with http:// or https://');
		}
	}

	if (projectsRoot.includes('\0')) {
		throw new Error('Invalid projects path');
	}

	return {
		projectsRoot,
		storageMode,
		syncServerUrl: syncServerUrl || undefined,
	};
}

export async function saveSettings(input: AppSettings): Promise<AppSettingsInfo> {
	const parsed = appSettingsSchema.parse(input);
	const data = normalizeSettingsInput(parsed);

	const file = getConfigFilePath();
	const tmp = `${file}.${Date.now()}.tmp`;
	await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
	await fsPromises.rename(tmp, file);

	await fsPromises.mkdir(path.resolve(process.cwd(), data.projectsRoot!), { recursive: true });

	return getAppSettingsInfo();
}
