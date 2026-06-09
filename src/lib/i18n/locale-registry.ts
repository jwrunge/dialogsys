import { isBundledLocale } from './bundled-locales';
import registryData from './locale-registry.data.json';

/** Source language for app UI copy (DOM text keys). */
export const SOURCE_LOCALE = 'en';

export type LocaleRegistryEntry = {
	tag: string;
	nativeName: string;
	englishName: string;
	aliases: string[];
	bundled?: boolean;
};

export type LocaleOption = {
	tag: string;
	label: string;
	nativeName: string;
	englishName: string;
	langCode: string;
	region: string;
	bundled: boolean;
	searchText: string;
};

const registry = registryData as LocaleRegistryEntry[];

export const LOCALE_REGISTRY: LocaleRegistryEntry[] = registry;

export const LOCALE_OPTIONS: LocaleOption[] = registry.map((entry) => {
	const { langCode, region, tag } = parseLocaleTag(entry.tag);
	const bundled = entry.bundled ?? isBundledLocale(tag);
	return {
		tag,
		label: entry.nativeName,
		nativeName: entry.nativeName,
		englishName: entry.englishName,
		langCode,
		region,
		bundled,
		searchText: [entry.nativeName, entry.englishName, ...(entry.aliases ?? []), tag]
			.join(' ')
			.toLowerCase(),
	};
});

export function getLocaleOption(tag: string | undefined | null): LocaleOption | undefined {
	const normalized = parseLocaleTag(tag ?? '').tag;
	return LOCALE_OPTIONS.find((option) => option.tag === normalized);
}

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
