import type { APIRoute } from 'astro';
import {
	getActiveOriginId,
	getClientId,
	getOriginLabel,
	setActiveOriginId,
} from '../../../../../lib/server/client';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../../../../lib/server/projects';
import { getAppSettingsInfo } from '../../../../../lib/server/settings';
import { switchOrigin } from '../../../../../lib/server/storage';
import { getSyncCredentials } from '../../../../../lib/server/sync-credentials';
import { listSyncOrigins } from '../../../../../lib/sync/client';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return toErrorResponse(new Error('Origin threads require remote storage'));
		}

		const clientId = getClientId();
		const activeOriginId = getActiveOriginId(slug);
		const origins = await listSyncOrigins(getSyncCredentials(), slug);

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
		return toErrorResponse(e, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return toErrorResponse(new Error('Origin threads require remote storage'));
		}

		const body = await parseJsonBody(request);
		const originId =
			typeof (body as { originId?: unknown }).originId === 'string'
				? (body as { originId: string }).originId.trim()
				: '';
		if (!originId) {
			return toErrorResponse(new Error('originId is required'));
		}

		await setActiveOriginId(slug, originId);
		await switchOrigin(slug, originId);

		return jsonResponse({ ok: true, activeOriginId: originId });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
