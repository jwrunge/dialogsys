import { SOURCE_LOCALE } from './locales';

export function formatDate(
	value: string | number | Date,
	locale = SOURCE_LOCALE,
	options?: Intl.DateTimeFormatOptions,
): string {
	const date = value instanceof Date ? value : new Date(value);
	return date.toLocaleDateString(locale, options);
}

export function formatDateTime(
	value: string | number | Date,
	locale = SOURCE_LOCALE,
	options?: Intl.DateTimeFormatOptions,
): string {
	const date = value instanceof Date ? value : new Date(value);
	return date.toLocaleString(locale, options);
}
