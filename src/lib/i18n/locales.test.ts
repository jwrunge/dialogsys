import { describe, expect, it } from 'vitest';
import { isSourceLocale, parseLocaleTag, resolveLocaleTag } from './locales';

describe('parseLocaleTag', () => {
	it('parses language-only tags', () => {
		expect(parseLocaleTag('es')).toEqual({ langCode: 'es', region: '', tag: 'es' });
	});

	it('parses language-region tags', () => {
		expect(parseLocaleTag('es-MX')).toEqual({ langCode: 'es', region: 'mx', tag: 'es-mx' });
	});
});

describe('resolveLocaleTag', () => {
	it('prefers configured locale', () => {
		expect(resolveLocaleTag('es', 'de')).toBe('es');
	});

	it('falls back to browser locale', () => {
		expect(resolveLocaleTag('', 'es')).toBe('es');
	});
});

describe('isSourceLocale', () => {
	it('treats English as source', () => {
		expect(isSourceLocale('en')).toBe(true);
		expect(isSourceLocale('en-US')).toBe(true);
		expect(isSourceLocale('es')).toBe(false);
	});
});
