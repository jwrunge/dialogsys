import type { CharactersPatchOp } from '../../schema/characters-patch';
import type { FlowPatchOp } from '../../schema/flow-patch';
import type { GameStatePatchOp } from '../../schema/game-state-patch';
import type { GraphPatchOp } from '../../schema/graph-patch';
import type { NotePatchOp } from '../../schema/note-patch';

export type DocPatchOp =
	| GraphPatchOp
	| FlowPatchOp
	| CharactersPatchOp
	| NotePatchOp
	| GameStatePatchOp;

import { normalizeSyncCredentials } from '../../sync/credentials';
import { getAppSettingsInfo } from '../settings';
import { getSyncCredentials } from '../sync-credentials';

export type GraphPatchBroadcast = {
	deviceId: string;
	displayName: string;
	originId: string;
	path: string;
	baseContentHash: string;
	contentHash: string;
	ops: DocPatchOp[];
};

export async function publishGraphPatch(slug: string, patch: GraphPatchBroadcast): Promise<void> {
	const info = getAppSettingsInfo();
	if (info.storageMode !== 'remote' || !info.syncServerUrl) return;

	const credentials = getSyncCredentials();
	const { baseUrl, token } = normalizeSyncCredentials(credentials);
	const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;

	await fetch(`${baseUrl}/projects/${encodeURIComponent(slug)}/realtime/publish${tokenQuery}`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			type: 'graphPatch',
			...patch,
		}),
	});
}
