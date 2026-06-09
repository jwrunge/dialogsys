import {
	getSyncCapabilities,
	type SyncAccessRole,
	type SyncAuthCapabilities,
} from '../../sync/client';
import { getAppSettingsInfo } from '../settings';
import { getSyncCredentials } from '../sync-credentials';

export async function resolveSyncCapabilities(): Promise<SyncAuthCapabilities> {
	const info = getAppSettingsInfo();
	if (info.storageMode !== 'remote' || !info.syncServerUrl) {
		return { role: 'write' };
	}

	try {
		return await getSyncCapabilities(getSyncCredentials());
	} catch {
		return { role: 'read' };
	}
}

export async function resolveSyncAccessRole(): Promise<SyncAccessRole> {
	const capabilities = await resolveSyncCapabilities();
	return capabilities.role;
}

export async function resolveSyncAllowedProjects(): Promise<string[] | undefined> {
	const capabilities = await resolveSyncCapabilities();
	return capabilities.projects?.length ? capabilities.projects : undefined;
}

export function assertWritable(role: SyncAccessRole): void {
	if (role === 'read') {
		throw new Error('This connection is read-only. Changes cannot be saved.');
	}
}
