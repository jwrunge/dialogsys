export const LOCALE_CHANGE_EVENT = 'dialogsys:locale-change';

export type LocaleChangeDetail = {
	locale: string;
};

export function dispatchLocaleChange(locale: string): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent<LocaleChangeDetail>(LOCALE_CHANGE_EVENT, {
			detail: { locale },
		}),
	);
}
