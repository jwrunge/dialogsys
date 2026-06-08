import { getSyncCapabilities, type SyncAccessRole } from '../../sync/client';
import { getAppSettingsInfo } from '../settings';
import { getSyncCredentials } from '../sync-credentials';

export async function resolveSyncAccessRole(): Promise<SyncAccessRole> {
	const info = getAppSettingsInfo();
	if (info.storageMode !== 'remote' || !info.syncServerUrl) {
		return 'write';
	}

	try {
		const capabilities = await getSyncCapabilities(getSyncCredentials());
		return capabilities.role;
	} catch {
		// Fail closed when remote — treat unknown as read-only.
		return 'read';
	}
}

export function assertWritable(role: SyncAccessRole): void {
	if (role === 'read') {
		throw new Error('This connection is read-only. Changes cannot be saved.');
	}
}
