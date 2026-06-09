/** Well-known UUID for the per-project shared coauthoring thread on the sync server. */
export const SHARED_ORIGIN_ID = '00000000-0000-4000-8000-000000000001';

export const SHARED_ORIGIN_LABEL = 'Shared coauthoring';

export function isSharedOrigin(originId: string): boolean {
	return originId === SHARED_ORIGIN_ID;
}
