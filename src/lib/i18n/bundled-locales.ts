import bundledTags from './bundled-locale-tags.json';

/** Locales with full UI catalogs shipped in the app bundle (top 15 by reach + localization priority). */
export const BUNDLED_LOCALE_TAGS: readonly string[] = bundledTags;

export type BundledLocaleTag = (typeof bundledTags)[number];

const bundledSet = new Set<string>(BUNDLED_LOCALE_TAGS);

export function isBundledLocale(tag: string): boolean {
	const base = tag.trim().toLowerCase().split('-')[0] ?? '';
	return bundledSet.has(base);
}
