export class SyncApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body?: unknown,
	) {
		super(message);
		this.name = 'SyncApiError';
	}
}

export class SyncConflictError extends SyncApiError {
	constructor(
		message: string,
		readonly path: string,
		readonly previousContentHash?: string,
	) {
		super(message, 409);
		this.name = 'SyncConflictError';
	}
}

export function isSyncConflictError(error: unknown): error is SyncConflictError {
	return error instanceof SyncConflictError;
}

export function isReadOnlySyncError(error: unknown): boolean {
	return error instanceof SyncApiError && error.status === 403;
}
