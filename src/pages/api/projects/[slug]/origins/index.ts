import type { APIRoute } from 'astro';
import { getAppSettingsInfo } from '../../../../../lib/server/settings';
import {
	getClientId,
	getActiveOriginId,
	getOriginLabel,
	setActiveOriginId,
} from '../../../../../lib/server/client';
import { listSyncOrigins } from '../../../../../lib/sync/client';
import { switchOrigin } from '../../../../../lib/server/storage';
import { jsonResponse, errorResponse } from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return errorResponse('Origin threads require remote storage', 400);
		}

		const clientId = getClientId();
		const activeOriginId = getActiveOriginId(slug);
		const origins = await listSyncOrigins(info.syncServerUrl, slug);

		return jsonResponse({
			origins: origins.map((origin) => ({
				...origin,
				label: getOriginLabel(origin.originId) ?? origin.label,
				isSelf: origin.originId === clientId,
				isActive: origin.originId === activeOriginId,
			})),
			clientId,
			activeOriginId,
		});
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return errorResponse('Origin threads require remote storage', 400);
		}

		const body = await request.json();
		const originId = (body.originId as string | undefined)?.trim();
		if (!originId) {
			return errorResponse('originId is required', 400);
		}

		await setActiveOriginId(slug, originId);
		await switchOrigin(slug, originId);

		return jsonResponse({ ok: true, activeOriginId: originId });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};
