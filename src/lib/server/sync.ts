import { isValidSyncServerUrl, testSyncConnection } from '../sync/client';
import type { SyncCredentials } from '../sync/credentials';
import { assertAllowedSyncServerUrl } from '../sync/url-policy';
import { getStoredSyncServerToken } from './settings';

export async function testSyncServerFromServer(
	credentials: Pick<SyncCredentials, 'baseUrl'> & { token?: string },
) {
	const baseUrl = credentials.baseUrl.trim();
	if (!baseUrl) {
		throw new Error('Sync server URL is required');
	}
	if (!isValidSyncServerUrl(baseUrl)) {
		throw new Error('Sync server URL must start with http:// or https://');
	}
	assertAllowedSyncServerUrl(baseUrl);
	return testSyncConnection({
		baseUrl,
		token: credentials.token?.trim() || getStoredSyncServerToken(),
	});
}
