import type { APIRoute } from 'astro';
import {
	assertWritable,
	resolveSyncAccessRole,
} from '../../../../../lib/server/collaboration/access';
import {
	enableSharedCoauthoring,
	leaveSharedCoauthoring,
} from '../../../../../lib/server/collaboration/shared-origin';
import { jsonResponse, toErrorResponse } from '../../../../../lib/server/projects';
import { getAppSettingsInfo } from '../../../../../lib/server/settings';

function assertRemote(): void {
	const info = getAppSettingsInfo();
	if (info.storageMode !== 'remote' || !info.syncServerUrl) {
		throw new Error('Shared coauthoring requires remote storage');
	}
}

export const POST: APIRoute = async ({ params }) => {
	try {
		assertWritable(await resolveSyncAccessRole());
		assertRemote();
		const result = await enableSharedCoauthoring(params.slug!);
		return jsonResponse({ ok: true, ...result });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		assertWritable(await resolveSyncAccessRole());
		assertRemote();
		const result = await leaveSharedCoauthoring(params.slug!);
		return jsonResponse({ ok: true, ...result });
	} catch (e) {
		return toErrorResponse(e);
	}
};
