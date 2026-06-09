import Fuse from 'fuse.js';
import { describe, expect, it } from 'vitest';
import { LOCALE_OPTIONS } from './locales';

describe('language picker search', () => {
	const fuse = new Fuse(LOCALE_OPTIONS, {
		keys: ['nativeName', 'englishName', 'tag', 'searchText'],
		threshold: 0.35,
		ignoreLocation: true,
	});

	it('finds Spanish by English name', () => {
		const hits = fuse.search('spanish').map((r) => r.item.tag);
		expect(hits).toContain('es');
	});

	it('finds Japanese by native label', () => {
		const hits = fuse.search('日本').map((r) => r.item.tag);
		expect(hits).toContain('ja');
	});

	it('lists bundled and additional locales', () => {
		const bundled = LOCALE_OPTIONS.filter((o) => o.bundled);
		const other = LOCALE_OPTIONS.filter((o) => !o.bundled);
		expect(bundled.length).toBe(15);
		expect(other.length).toBeGreaterThan(40);
	});
});
