import { testSyncConnection, isValidSyncServerUrl } from '../sync/client';

export async function testSyncServerFromServer(url: string) {
	const trimmed = url.trim();
	if (!trimmed) {
		throw new Error('Sync server URL is required');
	}
	if (!isValidSyncServerUrl(trimmed)) {
		throw new Error('Sync server URL must start with http:// or https://');
	}
	return testSyncConnection(trimmed);
}
