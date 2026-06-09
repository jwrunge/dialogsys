import type { APIRoute } from 'astro';
import { appSettingsSchema } from '../../lib/schema/settings';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../lib/server/projects';
import {
	getAppSettingsInfoAsync,
	getConfigFilePath,
	saveSettings,
} from '../../lib/server/settings';
import { testSyncServerFromServer } from '../../lib/server/sync';

export const GET: APIRoute = async () => {
	try {
		const info = await getAppSettingsInfoAsync();
		return jsonResponse({
			projectsRoot: info.projectsRoot,
			resolvedPath: info.resolvedPath,
			source: info.source,
			envOverride: info.envOverride,
			storageMode: info.storageMode,
			syncServerUrl: info.syncServerUrl,
			hasSyncServerToken: info.hasSyncServerToken,
			clientId: info.clientId,
			locale: info.locale,
			syncAccessRole: info.syncAccessRole,
			syncAllowedProjects: info.syncAllowedProjects,
			deviceDisplayName: info.deviceDisplayName,
			configFile: info.envOverride ? null : getConfigFilePath(),
		});
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonBody(request);
		const parsed = appSettingsSchema
			.pick({
				projectsRoot: true,
				storageMode: true,
				syncServerUrl: true,
				syncServerToken: true,
				locale: true,
				deviceDisplayName: true,
			})
			.partial()
			.parse(body);
		const saved = await saveSettings(parsed);
		const refreshed = await getAppSettingsInfoAsync();
		return jsonResponse({
			projectsRoot: saved.projectsRoot,
			resolvedPath: saved.resolvedPath,
			source: saved.source,
			envOverride: saved.envOverride,
			storageMode: saved.storageMode,
			syncServerUrl: saved.syncServerUrl,
			hasSyncServerToken: saved.hasSyncServerToken,
			clientId: saved.clientId,
			locale: refreshed.locale,
			syncAccessRole: refreshed.syncAccessRole,
			syncAllowedProjects: refreshed.syncAllowedProjects,
			deviceDisplayName: refreshed.deviceDisplayName,
			configFile: getConfigFilePath(),
		});
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonBody(request);
		const url =
			typeof (body as { syncServerUrl?: unknown }).syncServerUrl === 'string'
				? (body as { syncServerUrl: string }).syncServerUrl.trim()
				: '';
		if (!url) {
			return toErrorResponse(new Error('syncServerUrl is required'));
		}
		const token =
			typeof (body as { syncServerToken?: unknown }).syncServerToken === 'string'
				? (body as { syncServerToken: string }).syncServerToken.trim()
				: undefined;
		const result = await testSyncServerFromServer({ baseUrl: url, token });
		if (!result.ok) {
			return toErrorResponse(new Error(result.error ?? 'Connection failed'), 502);
		}
		return jsonResponse(result);
	} catch (e) {
		return toErrorResponse(e);
	}
};
