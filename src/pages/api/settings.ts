import type { APIRoute } from 'astro';
import {
	getProjectsRootInfo,
	getConfigFilePath,
	saveSettings,
} from '../../lib/server/settings';
import { jsonResponse, errorResponse } from '../../lib/server/projects';

export const GET: APIRoute = async () => {
	try {
		const info = getProjectsRootInfo();
		return jsonResponse({
			projectsRoot: info.configuredPath,
			resolvedPath: info.resolvedPath,
			source: info.source,
			envOverride: info.envOverride,
			configFile: info.envOverride ? null : getConfigFilePath(),
		});
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await request.json();
		const info = await saveSettings({ projectsRoot: body.projectsRoot });
		return jsonResponse({
			projectsRoot: info.configuredPath,
			resolvedPath: info.resolvedPath,
			source: info.source,
			envOverride: info.envOverride,
			configFile: getConfigFilePath(),
		});
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
