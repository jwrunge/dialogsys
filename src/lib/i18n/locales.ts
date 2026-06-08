export type LocaleOption = {
	tag: string;
	label: string;
	langCode: string;
	region: string;
};

/** Source language for app UI copy (DOM text keys). */
export const SOURCE_LOCALE = 'en';

export const LOCALE_OPTIONS: LocaleOption[] = [
	{ tag: 'en', label: 'English', langCode: 'en', region: '' },
	{ tag: 'es', label: 'Español', langCode: 'es', region: '' },
];

export function parseLocaleTag(tag: string | undefined | null): {
	langCode: string;
	region: string;
	tag: string;
} {
	const raw = tag?.trim().toLowerCase() || SOURCE_LOCALE;
	const [langCode, region = ''] = raw.split('-');
	const normalized = region ? `${langCode}-${region}` : langCode;
	return { langCode: langCode || SOURCE_LOCALE, region, tag: normalized };
}

export function resolveLocaleTag(preferred: string | undefined | null, fallback?: string): string {
	const trimmed = preferred?.trim();
	if (trimmed) return parseLocaleTag(trimmed).tag;
	if (fallback?.trim()) return parseLocaleTag(fallback).tag;
	return SOURCE_LOCALE;
}

export function isSourceLocale(tag: string): boolean {
	const { langCode } = parseLocaleTag(tag);
	return langCode === SOURCE_LOCALE;
}
