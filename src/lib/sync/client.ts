import type { OriginMeta } from '../schema/origin';
import type { ProjectMeta } from '../schema/project';
import { normalizeSyncCredentials, type SyncCredentials, syncAuthHeaders } from './credentials';

export type { SyncCredentials } from './credentials';

export type SyncHealth = {
	ok: boolean;
};

export type SyncConnectionResult = {
	ok: boolean;
	projectCount: number;
	error?: string;
};

export type SyncFileInfo = {
	path: string;
	size: number;
	modifiedAt: string;
	contentHash: string;
};

export type SyncFileRead = {
	project: string;
	originId: string;
	path: string;
	content: string;
	timestamp: string;
	contentHash: string;
	requestId: string;
};

export function isValidSyncServerUrl(url: string): boolean {
	try {
		const parsed = new URL(normalizeSyncCredentials(url).baseUrl);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

async function syncFetch<T>(
	credentials: string | SyncCredentials,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const { baseUrl, token } = normalizeSyncCredentials(credentials);
	const res = await fetch(`${baseUrl}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...syncAuthHeaders(token),
			...init?.headers,
		},
	});
	const text = await res.text();
	let data: unknown = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { error: text };
		}
	}
	if (!res.ok) {
		const message =
			(data as { error?: string })?.error ??
			(data as { message?: string })?.message ??
			res.statusText;
		throw new Error(message || `Request failed (${res.status})`);
	}
	return data as T;
}

export async function checkSyncHealth(credentials: string | SyncCredentials): Promise<SyncHealth> {
	return syncFetch<SyncHealth>(credentials, '/health');
}

export async function listSyncProjects(
	credentials: string | SyncCredentials,
): Promise<ProjectMeta[]> {
	const res = await syncFetch<{ projects: ProjectMeta[] }>(credentials, '/projects');
	return Array.isArray(res.projects) ? res.projects : [];
}

export async function createSyncProject(
	credentials: string | SyncCredentials,
	input: { slug: string; displayName: string; description?: string },
): Promise<ProjectMeta> {
	const res = await syncFetch<{ project: ProjectMeta }>(credentials, '/projects', {
		method: 'POST',
		body: JSON.stringify(input),
	});
	return res.project;
}

export async function listSyncOrigins(
	credentials: string | SyncCredentials,
	slug: string,
): Promise<OriginMeta[]> {
	const res = await syncFetch<{ origins: OriginMeta[] }>(credentials, `/projects/${slug}/origins`);
	return Array.isArray(res.origins) ? res.origins : [];
}

export async function ensureSyncOrigin(
	credentials: string | SyncCredentials,
	slug: string,
	originId: string,
): Promise<OriginMeta> {
	const res = await syncFetch<{ origin: OriginMeta }>(
		credentials,
		`/projects/${slug}/origins/${originId}`,
		{ method: 'POST', body: '{}' },
	);
	return res.origin;
}

export async function listOriginFiles(
	credentials: string | SyncCredentials,
	slug: string,
	originId: string,
): Promise<SyncFileInfo[]> {
	const res = await syncFetch<{ files: SyncFileInfo[] }>(
		credentials,
		`/projects/${slug}/origins/${originId}/files`,
	);
	return Array.isArray(res.files) ? res.files : [];
}

export async function readOriginFile(
	credentials: string | SyncCredentials,
	slug: string,
	originId: string,
	filePath: string,
): Promise<SyncFileRead> {
	return syncFetch<SyncFileRead>(
		credentials,
		`/projects/${slug}/origins/${originId}/files/${filePath}`,
	);
}

export async function writeOriginFile(
	credentials: string | SyncCredentials,
	slug: string,
	originId: string,
	filePath: string,
	content: string,
	previousContentHash?: string,
): Promise<void> {
	await syncFetch(credentials, `/projects/${slug}/origins/${originId}/files/${filePath}`, {
		method: 'PUT',
		body: JSON.stringify({ content, previousContentHash }),
	});
}

export async function deleteOriginFile(
	credentials: string | SyncCredentials,
	slug: string,
	originId: string,
	filePath: string,
): Promise<void> {
	await syncFetch(credentials, `/projects/${slug}/origins/${originId}/files/${filePath}`, {
		method: 'DELETE',
	});
}

export async function testSyncConnection(
	credentials: string | SyncCredentials,
): Promise<SyncConnectionResult> {
	try {
		const { baseUrl } = normalizeSyncCredentials(credentials);
		const { assertAllowedSyncServerUrl } = await import('./url-policy');
		assertAllowedSyncServerUrl(baseUrl);

		const health = await checkSyncHealth(credentials);
		if (!health.ok) {
			return { ok: false, projectCount: 0, error: 'Server returned unhealthy status' };
		}
		const projects = await listSyncProjects(credentials);
		return { ok: true, projectCount: projects.length };
	} catch (e) {
		return { ok: false, projectCount: 0, error: (e as Error).message };
	}
}
