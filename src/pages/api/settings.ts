import type { APIRoute } from 'astro';
import {
	getAppSettingsInfo,
	getConfigFilePath,
	saveSettings,
} from '../../lib/server/settings';
import { testSyncServerFromServer } from '../../lib/server/sync';
import { jsonResponse, errorResponse } from '../../lib/server/projects';

export const GET: APIRoute = async () => {
	try {
		const info = getAppSettingsInfo();
		return jsonResponse({
			projectsRoot: info.projectsRoot,
			resolvedPath: info.resolvedPath,
			source: info.source,
			envOverride: info.envOverride,
			storageMode: info.storageMode,
			syncServerUrl: info.syncServerUrl,
			configFile: info.envOverride ? null : getConfigFilePath(),
		});
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await request.json();
		const info = await saveSettings({
			projectsRoot: body.projectsRoot,
			storageMode: body.storageMode,
			syncServerUrl: body.syncServerUrl,
		});
		return jsonResponse({
			projectsRoot: info.projectsRoot,
			resolvedPath: info.resolvedPath,
			source: info.source,
			envOverride: info.envOverride,
			storageMode: info.storageMode,
			syncServerUrl: info.syncServerUrl,
			configFile: getConfigFilePath(),
		});
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const url = (body.syncServerUrl as string | undefined)?.trim();
		if (!url) {
			return errorResponse('syncServerUrl is required', 400);
		}
		const result = await testSyncServerFromServer(url);
		if (!result.ok) {
			return errorResponse(result.error ?? 'Connection failed', 502);
		}
		return jsonResponse(result);
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
