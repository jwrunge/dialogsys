import { ApiError } from '../api';

export const DIRTY_CHANGE_EVENT = 'dialogsys:dirty-change';
export const SYNC_CONFLICT_EVENT = 'dialogsys:sync-conflict';

let dirtyCount = 0;

export function markDirty(): void {
	dirtyCount += 1;
	dispatchDirtyChange();
}

export function markClean(): void {
	if (dirtyCount === 0) return;
	dirtyCount = 0;
	dispatchDirtyChange();
}

export function isDirty(): boolean {
	return dirtyCount > 0;
}

function dispatchDirtyChange(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent(DIRTY_CHANGE_EVENT, {
			detail: { dirty: dirtyCount > 0 },
		}),
	);
}

/** Dispatches a sync-conflict event when a save returns HTTP 409. */
export function notifySaveConflict(e: unknown): boolean {
	if (!(e instanceof ApiError) || e.status !== 409 || !e.details?.path) {
		return false;
	}
	if (typeof window === 'undefined') return true;
	window.dispatchEvent(
		new CustomEvent(SYNC_CONFLICT_EVENT, {
			detail: { path: e.details.path },
		}),
	);
	return true;
}
