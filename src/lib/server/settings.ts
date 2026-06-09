import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
	type AppSettings,
	appSettingsSchema,
	type StorageMode,
	type SyncAccessRole,
} from '../schema/settings';
import { isValidSyncServerUrl } from '../sync/client';
import { getClientId } from './client';
import { readConfigSync, updateConfig } from './config-file';
import { validateConfiguredProjectsRoot } from './projectsRoot';

const DEFAULT_ROOT = './projects';

export { getConfigFilePath } from './config-file';

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
	hasSyncServerToken: boolean;
	clientId: string;
	locale: string;
	syncAccessRole: SyncAccessRole;
	syncAllowedProjects?: string[];
	deviceDisplayName: string;
};

export function getPluginSettings(): NonNullable<AppSettings['plugins']> {
	return readConfigSync().plugins ?? {};
}

export function getConfiguredLocale(): string | undefined {
	const locale = readConfigSync().locale?.trim();
	return locale || undefined;
}

export function resolveProjectsRoot(settings?: AppSettings): ProjectsRootInfo {
	const envRoot = process.env.DIALOGSYS_PROJECTS_ROOT?.trim();
	if (envRoot) {
		const safeRoot = validateConfiguredProjectsRoot(envRoot, { allowAbsolute: true });
		const resolvedPath = path.isAbsolute(safeRoot)
			? safeRoot
			: path.resolve(process.cwd(), safeRoot);
		return {
			configuredPath: safeRoot,
			resolvedPath,
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

function syncTokenFilePath(): string | undefined {
	const file = process.env.DIALOGSYS_SYNC_TOKEN_FILE?.trim();
	return file || undefined;
}

function readSyncTokenFile(): string | undefined {
	const file = syncTokenFilePath();
	if (!file) return undefined;
	try {
		const token = fs.readFileSync(file, 'utf-8').trim();
		return token || undefined;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw e;
	}
}

async function writeSyncTokenFile(token: string | undefined): Promise<void> {
	const file = syncTokenFilePath();
	if (!file) return;
	if (!token) {
		await fsPromises.unlink(file).catch((e) => {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
		});
		return;
	}
	await fsPromises.mkdir(path.dirname(file), { recursive: true });
	await fsPromises.writeFile(file, token, { mode: 0o600 });
}

export function getStoredSyncServerToken(): string | undefined {
	const fromFile = readSyncTokenFile();
	if (fromFile) return fromFile;

	const envToken = process.env.DIALOGSYS_SYNC_SERVER_TOKEN?.trim();
	if (envToken) return envToken;

	const token = readConfigSync().syncServerToken?.trim();
	return token || undefined;
}

export function getDeviceDisplayName(): string {
	const config = readConfigSync();
	const clientId = getClientId();
	return config.deviceDisplayName?.trim() || config.originLabels?.[clientId]?.trim() || '';
}

export function getAppSettingsInfo(): AppSettingsInfo {
	const config = readConfigSync();
	const root = resolveProjectsRoot(config);
	const clientId = getClientId();
	return {
		projectsRoot: root.configuredPath,
		resolvedPath: root.resolvedPath,
		source: root.source,
		envOverride: root.envOverride,
		storageMode: config.storageMode ?? 'local',
		syncServerUrl: config.syncServerUrl?.trim() ?? '',
		hasSyncServerToken: Boolean(getStoredSyncServerToken()),
		clientId,
		locale: getConfiguredLocale() ?? 'en',
		syncAccessRole: 'write',
		deviceDisplayName: getDeviceDisplayName(),
	};
}

export async function getAppSettingsInfoAsync(): Promise<AppSettingsInfo> {
	const info = getAppSettingsInfo();
	if (info.storageMode !== 'remote' || !info.syncServerUrl) {
		return info;
	}
	const { resolveSyncAccessRole, resolveSyncAllowedProjects } = await import(
		'./collaboration/access'
	);
	return {
		...info,
		syncAccessRole: await resolveSyncAccessRole(),
		syncAllowedProjects: await resolveSyncAllowedProjects(),
	};
}

export async function loadSettings(): Promise<AppSettings> {
	return readConfigSync();
}

function normalizeSettingsInput(
	input: AppSettings,
	current: AppSettings,
): { settings: AppSettings; externalTokenUpdate?: string } {
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

	const safeRoot = validateConfiguredProjectsRoot(projectsRoot);

	let syncServerToken = current.syncServerToken;
	let externalTokenUpdate: string | undefined;
	if (input.syncServerToken !== undefined) {
		const trimmed = input.syncServerToken.trim();
		if (syncTokenFilePath()) {
			externalTokenUpdate = trimmed || undefined;
			syncServerToken = current.syncServerToken;
		} else {
			syncServerToken = trimmed || undefined;
		}
	}

	const locale = input.locale?.trim() || current.locale?.trim() || undefined;
	const deviceDisplayName =
		input.deviceDisplayName?.trim() || current.deviceDisplayName?.trim() || undefined;
	const clientId = current.clientId ?? getClientId();
	const originLabels = { ...current.originLabels };
	if (deviceDisplayName) {
		originLabels[clientId] = deviceDisplayName;
	}

	const settings: AppSettings = {
		projectsRoot: safeRoot,
		storageMode,
		syncServerUrl: syncServerUrl || undefined,
		syncServerToken,
		locale,
		deviceDisplayName,
		originLabels: Object.keys(originLabels).length > 0 ? originLabels : undefined,
	};

	return { settings, externalTokenUpdate };
}

export async function saveSettings(input: AppSettings): Promise<AppSettingsInfo> {
	const current = readConfigSync();
	const parsed = appSettingsSchema.parse({ ...current, ...input });
	const { settings: data, externalTokenUpdate } = normalizeSettingsInput(parsed, current);

	if (externalTokenUpdate !== undefined) {
		await writeSyncTokenFile(externalTokenUpdate);
	}

	await updateConfig(() => data);

	await fsPromises.mkdir(path.resolve(process.cwd(), data.projectsRoot!), { recursive: true });

	return getAppSettingsInfo();
}
