import type { ZodType } from 'zod';
import { enqueueWrite, isNetworkError } from './client/offline-queue';

export type ApiErrorDetails = {
	path?: string;
	previousContentHash?: string;
};

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly details?: ApiErrorDetails,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...init?.headers,
			},
		});
	} catch (e) {
		const method = (init?.method ?? 'GET').toUpperCase();
		if (method !== 'GET' && method !== 'HEAD' && isNetworkError(e)) {
			enqueueWrite(url, init ?? {});
			throw new ApiError('Offline — change queued for sync when you reconnect', 0);
		}
		throw e;
	}

	const contentType = res.headers.get('content-type') ?? '';
	const text = await res.text();

	if (!res.ok) {
		let message = res.statusText;
		let details: ApiErrorDetails | undefined;
		if (contentType.includes('application/json') && text) {
			try {
				const data = JSON.parse(text) as {
					error?: string;
					path?: string;
					previousContentHash?: string;
				};
				message = data.error ?? message;
				if (data.path) {
					details = {
						path: data.path,
						previousContentHash: data.previousContentHash,
					};
				}
			} catch {
				// keep status text
			}
		}
		throw new ApiError(message, res.status, details);
	}

	if (!text.trim()) {
		return {} as T;
	}

	if (!contentType.includes('application/json')) {
		throw new ApiError('Unexpected response format', res.status);
	}

	try {
		return JSON.parse(text) as T;
	} catch {
		throw new ApiError('Invalid JSON response', res.status);
	}
}

export async function apiValidated<T>(
	url: string,
	schema: ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	const raw = await api<unknown>(url, init);
	return schema.parse(raw);
}
