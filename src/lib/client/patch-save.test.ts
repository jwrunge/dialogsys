import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePatchWithRebase } from './patch-save';

describe('savePatchWithRebase', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('retries once after a 409 conflict', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error: 'changed',
						currentContentHash: 'server-hash',
						graph: { id: 's', displayName: 'S', nodes: [], edges: [] },
					}),
					{ status: 409, headers: { 'Content-Type': 'application/json' } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						graph: { id: 's', displayName: 'S2', nodes: [], edges: [] },
						contentHash: 'new-hash',
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			);

		const result = await savePatchWithRebase({
			url: '/api/test',
			path: 'dialogs/s.graph.json',
			saved: { id: 's', displayName: 'S', nodes: [], edges: [] },
			next: { id: 's', displayName: 'S2', nodes: [], edges: [] },
			contentHash: 'stale-hash',
			ops: [{ op: 'updateMeta', displayName: 'S2' }],
			computeOps: (base, desired) =>
				base.displayName === desired.displayName
					? []
					: [{ op: 'updateMeta', displayName: desired.displayName }],
			parseSuccess: (res) => ({
				saved: (res as { graph: { displayName: string } }).graph,
				contentHash: (res as { contentHash: string }).contentHash,
			}),
			parseConflict: (body) => {
				const graph = body.graph as { displayName: string } | undefined;
				const hash = body.currentContentHash;
				if (!graph || typeof hash !== 'string') return null;
				return { saved: graph, contentHash: hash };
			},
		});

		expect(result.rebased).toBe(true);
		expect(result.contentHash).toBe('new-hash');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
