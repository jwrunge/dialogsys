import type { ProjectMeta } from '../schema/project';

export type SyncHealth = {
	ok: boolean;
};

export type SyncConnectionResult = {
	ok: boolean;
	projectCount: number;
	error?: string;
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
