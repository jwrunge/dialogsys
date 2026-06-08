import TranslationObserver from '@jwrunge/transmut/observer';
import { LOCALE_CHANGE_EVENT, type LocaleChangeDetail } from '../i18n/events';
import { parseLocaleTag, SOURCE_LOCALE } from '../i18n/locales';

let observer: TranslationObserver | null = null;
let observerLocale = SOURCE_LOCALE;

async function fetchTranslations(
	{ langCode, region }: { langCode: string; region?: string },
	keys: string[],
): Promise<Record<string, string>> {
	if (langCode === SOURCE_LOCALE) return {};

	const params = new URLSearchParams({ lang: langCode });
	if (region) params.set('region', region);

	const response = await fetch(`/api/translations?${params}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ keys }),
	});

	if (!response.ok) return {};
	return (await response.json()) as Record<string, string>;
}

export function getTranslationObserver(): TranslationObserver | null {
	return observer;
}

export async function initTranslationObserver(localeTag: string): Promise<TranslationObserver> {
	const { langCode, region, tag } = parseLocaleTag(localeTag);

	if (observer && observerLocale === tag) {
		return observer;
	}

	if (observer) {
		observer.disconnect();
		observer = null;
	}

	observer = new TranslationObserver(SOURCE_LOCALE, tag, fetchTranslations, 24, undefined, {
		requireExplicitOptIn: true,
		textSelector: '[data-transmut]',
		attributeSelector: '[data-transmut-attrs]',
		attributeNames: ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'],
		skipEditable: true,
		setLanguageAttributes: true,
		direction: 'auto',
	});

	observerLocale = tag;
	await observer.changeLocale(langCode, region);
	return observer;
}

export async function applyAppLocale(localeTag: string): Promise<void> {
	const obs = await initTranslationObserver(localeTag);
	const { langCode, region } = parseLocaleTag(localeTag);
	await obs.changeLocale(langCode, region);
}

export function bindLocaleChangeListener(): () => void {
	const handler = (event: Event) => {
		const detail = (event as CustomEvent<LocaleChangeDetail>).detail;
		if (!detail?.locale) return;
		void applyAppLocale(detail.locale);
	};
	window.addEventListener(LOCALE_CHANGE_EVENT, handler);
	return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
}
