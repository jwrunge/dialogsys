import type { ZodType } from 'zod';

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});

	const contentType = res.headers.get('content-type') ?? '';
	const text = await res.text();

	if (!res.ok) {
		let message = res.statusText;
		if (contentType.includes('application/json') && text) {
			try {
				const data = JSON.parse(text) as { error?: string };
				message = data.error ?? message;
			} catch {
				// keep status text
			}
		}
		throw new ApiError(message, res.status);
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
