import type { ProjectMeta } from '../schema/project';
import type { OriginMeta } from '../schema/origin';

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

function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function isValidSyncServerUrl(url: string): boolean {
	try {
		const parsed = new URL(normalizeBaseUrl(url));
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

async function syncFetch<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
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

export async function checkSyncHealth(baseUrl: string): Promise<SyncHealth> {
	return syncFetch<SyncHealth>(baseUrl, '/health');
}

export async function listSyncProjects(baseUrl: string): Promise<ProjectMeta[]> {
	const res = await syncFetch<{ projects: ProjectMeta[] }>(baseUrl, '/projects');
	return Array.isArray(res.projects) ? res.projects : [];
}

export async function createSyncProject(
	baseUrl: string,
	input: { slug: string; displayName: string; description?: string },
): Promise<ProjectMeta> {
	const res = await syncFetch<{ project: ProjectMeta }>(baseUrl, '/projects', {
		method: 'POST',
		body: JSON.stringify(input),
	});
	return res.project;
}

export async function listSyncOrigins(baseUrl: string, slug: string): Promise<OriginMeta[]> {
	const res = await syncFetch<{ origins: OriginMeta[] }>(baseUrl, `/projects/${slug}/origins`);
	return Array.isArray(res.origins) ? res.origins : [];
}

export async function ensureSyncOrigin(
	baseUrl: string,
	slug: string,
	originId: string,
): Promise<OriginMeta> {
	const res = await syncFetch<{ origin: OriginMeta }>(
		baseUrl,
		`/projects/${slug}/origins/${originId}`,
		{ method: 'POST', body: '{}' },
	);
	return res.origin;
}

export async function listOriginFiles(
	baseUrl: string,
	slug: string,
	originId: string,
): Promise<SyncFileInfo[]> {
	const res = await syncFetch<{ files: SyncFileInfo[] }>(
		baseUrl,
		`/projects/${slug}/origins/${originId}/files`,
	);
	return Array.isArray(res.files) ? res.files : [];
}

export async function readOriginFile(
	baseUrl: string,
	slug: string,
	originId: string,
	filePath: string,
): Promise<SyncFileRead> {
	return syncFetch<SyncFileRead>(
		baseUrl,
		`/projects/${slug}/origins/${originId}/files/${filePath}`,
	);
}

export async function writeOriginFile(
	baseUrl: string,
	slug: string,
	originId: string,
	filePath: string,
	content: string,
	previousContentHash?: string,
): Promise<void> {
	await syncFetch(baseUrl, `/projects/${slug}/origins/${originId}/files/${filePath}`, {
		method: 'PUT',
		body: JSON.stringify({ content, previousContentHash }),
	});
}

export async function deleteOriginFile(
	baseUrl: string,
	slug: string,
	originId: string,
	filePath: string,
): Promise<void> {
	await syncFetch(baseUrl, `/projects/${slug}/origins/${originId}/files/${filePath}`, {
		method: 'DELETE',
	});
}

export async function testSyncConnection(baseUrl: string): Promise<SyncConnectionResult> {
	try {
		const health = await checkSyncHealth(baseUrl);
		if (!health.ok) {
			return { ok: false, projectCount: 0, error: 'Server returned unhealthy status' };
		}
		const projects = await listSyncProjects(baseUrl);
		return { ok: true, projectCount: projects.length };
	} catch (e) {
		return { ok: false, projectCount: 0, error: (e as Error).message };
	}
}
