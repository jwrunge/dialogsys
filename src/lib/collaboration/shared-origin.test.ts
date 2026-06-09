import { describe, expect, it } from 'vitest';
import { isSharedOrigin, SHARED_ORIGIN_ID } from './shared-origin';

describe('shared origin', () => {
	it('recognizes the well-known shared thread id', () => {
		expect(isSharedOrigin(SHARED_ORIGIN_ID)).toBe(true);
		expect(isSharedOrigin('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
	});
});
