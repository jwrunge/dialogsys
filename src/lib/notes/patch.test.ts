import { describe, expect, it } from 'vitest';
import { hashNoteContent } from './content-hash';
import { applyNotePatchOps, computeNotePatch } from './patch';

describe('note patch', () => {
	it('diffs and applies content replacement', () => {
		const base = '# Overview\n\nHello.';
		const next = '# Overview\n\nHello, world.';
		const ops = computeNotePatch(base, next);
		expect(ops).toHaveLength(1);
		expect(ops[0]?.op).toBe('replaceContent');
		expect(applyNotePatchOps(base, ops)).toBe(next);
	});

	it('content hash changes when note changes', () => {
		const base = 'Draft notes';
		const next = applyNotePatchOps(base, [{ op: 'replaceContent', content: 'Final notes' }]);
		expect(hashNoteContent(next)).not.toBe(hashNoteContent(base));
	});
});
