import type { APIRoute } from 'astro';
import { diffOriginThreads } from '../../../../../lib/server/collaboration/diff';
import { jsonResponse, toErrorResponse } from '../../../../../lib/server/http';
import { getAppSettingsInfo } from '../../../../../lib/server/settings';

export const GET: APIRoute = async ({ params, url }) => {
	try {
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return toErrorResponse(new Error('Origin diff requires remote storage'));
		}

		const fromOriginId = url.searchParams.get('from')?.trim();
		const toOriginId = url.searchParams.get('to')?.trim();
		if (!fromOriginId || !toOriginId) {
			return toErrorResponse(new Error('from and to origin IDs are required'));
		}

		const diff = await diffOriginThreads(slug, fromOriginId, toOriginId);
		return jsonResponse(diff);
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
