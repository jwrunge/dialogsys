import type { SyncCredentials } from '../sync/credentials';
import { getAppSettingsInfo, getStoredSyncServerToken } from './settings';

export function getSyncCredentials(): SyncCredentials {
	const { syncServerUrl } = getAppSettingsInfo();
	return {
		baseUrl: syncServerUrl,
		token: getStoredSyncServerToken(),
	};
}
