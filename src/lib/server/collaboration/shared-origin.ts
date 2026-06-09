import {
	isSharedOrigin,
	SHARED_ORIGIN_ID,
	SHARED_ORIGIN_LABEL,
} from '../../collaboration/shared-origin';
import {
	ensureSyncOrigin,
	listOriginFiles,
	readOriginFile,
	writeOriginFile,
} from '../../sync/client';
import { getActiveOriginId, getClientId, setActiveOriginId } from '../client';
import { getSyncCredentials } from '../sync-credentials';
import { switchOrigin } from '../storage';

export async function copyOriginThread(
	slug: string,
	fromOriginId: string,
	toOriginId: string,
): Promise<void> {
	const credentials = getSyncCredentials();
	await ensureSyncOrigin(credentials, slug, toOriginId);
	const files = await listOriginFiles(credentials, slug, fromOriginId);
	for (const file of files) {
		const res = await readOriginFile(credentials, slug, fromOriginId, file.path);
		await writeOriginFile(credentials, slug, toOriginId, file.path, res.content);
	}
}

export async function enableSharedCoauthoring(slug: string): Promise<{ activeOriginId: string }> {
	const credentials = getSyncCredentials();
	const currentOrigin = getActiveOriginId(slug);
	await ensureSyncOrigin(credentials, slug, SHARED_ORIGIN_ID);

	const sharedFiles = await listOriginFiles(credentials, slug, SHARED_ORIGIN_ID);
	if (sharedFiles.length === 0 && !isSharedOrigin(currentOrigin)) {
		await copyOriginThread(slug, currentOrigin, SHARED_ORIGIN_ID);
	}

	await setActiveOriginId(slug, SHARED_ORIGIN_ID);
	await switchOrigin(slug, SHARED_ORIGIN_ID);
	return { activeOriginId: SHARED_ORIGIN_ID };
}

export async function leaveSharedCoauthoring(slug: string): Promise<{ activeOriginId: string }> {
	const clientId = getClientId();
	await setActiveOriginId(slug, clientId);
	await switchOrigin(slug, clientId);
	return { activeOriginId: clientId };
}

export function decorateOriginLabel(originId: string, label?: string): string | undefined {
	if (isSharedOrigin(originId)) return SHARED_ORIGIN_LABEL;
	return label;
}
