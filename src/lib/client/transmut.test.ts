import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changeLocale = vi.fn(async () => {});
const disconnect = vi.fn();

vi.mock('@jwrunge/transmut/observer', () => ({
	default: vi.fn(() => ({
		changeLocale,
		disconnect,
	})),
}));

describe('initTranslationObserver', () => {
	beforeEach(() => {
		vi.resetModules();
		changeLocale.mockClear();
		disconnect.mockClear();
	});

	afterEach(() => {
		vi.resetModules();
	});

	it('reuses the observer and calls changeLocale instead of recreating on locale switch', async () => {
		const TranslationObserver = (await import('@jwrunge/transmut/observer')).default;
		const { initTranslationObserver } = await import('./transmut');

		await initTranslationObserver('es');
		await initTranslationObserver('en');

		expect(TranslationObserver).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();
		expect(changeLocale).toHaveBeenCalledWith('en', '');
	});
});
