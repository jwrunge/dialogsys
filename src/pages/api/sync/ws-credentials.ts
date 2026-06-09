import type { APIRoute } from 'astro';
import { jsonResponse, toErrorResponse } from '../../../lib/server/http';
import { getAppSettingsInfo } from '../../../lib/server/settings';
import { getSyncCredentials } from '../../../lib/server/sync-credentials';

/** Returns sync server WebSocket credentials for the current session (remote storage only). */
export const GET: APIRoute = async () => {
	try {
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return toErrorResponse(new Error('WebSocket credentials require remote storage'));
		}
		const credentials = getSyncCredentials();
		return jsonResponse({
			baseUrl: credentials.baseUrl,
			hasToken: Boolean(credentials.token),
			// Token stays server-side in config/keychain; expose only for same-origin WS auth.
			token: credentials.token ?? null,
		});
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
