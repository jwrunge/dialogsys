import { ZodError } from 'zod';
import { SyncApiError, SyncConflictError } from '../sync/errors';

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

export class RequestTooLargeError extends Error {
	constructor() {
		super('Request body too large');
		this.name = 'RequestTooLargeError';
	}
}

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function errorResponse(message: string, status = 400): Response {
	return jsonResponse({ error: message }, status);
}

export async function parseJsonBody(
	request: Request,
	maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > maxBytes) {
		throw new RequestTooLargeError();
	}

	const text = await request.text();
	if (text.length > maxBytes) {
		throw new RequestTooLargeError();
	}
	if (!text.trim()) {
		return {};
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new Error('Invalid JSON body');
	}
}

const CLIENT_ERROR_PATTERNS: { match: (msg: string) => boolean; status: number }[] = [
	{ match: (m) => m.includes('not found') || m === 'Scene not found', status: 404 },
	{ match: (m) => m.includes('already exists'), status: 409 },
	{ match: (m) => m.includes('read-only'), status: 403 },
	{ match: (m) => m.includes('changed since'), status: 409 },
	{
		match: (m) => m.includes('Invalid') || m.includes('required') || m.includes('must'),
		status: 400,
	},
	{ match: (m) => m.includes('Cannot delete'), status: 400 },
	{ match: (m) => m.includes('does not match'), status: 400 },
	{ match: (m) => m.includes('traversal'), status: 400 },
];

function statusForMessage(message: string): number {
	for (const { match, status } of CLIENT_ERROR_PATTERNS) {
		if (match(message)) return status;
	}
	return 500;
}

export function toErrorResponse(error: unknown, fallbackStatus = 400): Response {
	if (error instanceof RequestTooLargeError) {
		return errorResponse(error.message, 413);
	}
	if (error instanceof ZodError) {
		return errorResponse('Validation failed', 400);
	}
	if (error instanceof SyncConflictError) {
		return jsonResponse(
			{
				error: error.message,
				path: error.path,
				previousContentHash: error.previousContentHash,
			},
			409,
		);
	}
	if (error instanceof SyncApiError) {
		return errorResponse(error.message, error.status);
	}

	const message = error instanceof Error ? error.message : 'Request failed';
	const status = statusForMessage(message);

	if (status >= 500) {
		console.error('[api]', error);
		return errorResponse('Internal server error', 500);
	}

	return errorResponse(message, status === 500 ? fallbackStatus : status);
}
