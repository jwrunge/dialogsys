/**
 * Smoke test for in-place locale switching (regression for observer recreation bug).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changeLocale = vi.fn(async () => {});
const disconnect = vi.fn();

vi.mock('@jwrunge/transmut/observer', () => ({
	default: vi.fn(() => ({
		changeLocale,
		disconnect,
	})),
}));

describe('locale switch smoke', () => {
	beforeEach(() => {
		vi.resetModules();
		changeLocale.mockClear();
		disconnect.mockClear();
	});

	afterEach(() => {
		vi.resetModules();
	});

	it('switches es → en → es without recreating the observer', async () => {
		const { initTranslationObserver } = await import('../client/transmut');
		const TranslationObserver = (await import('@jwrunge/transmut/observer')).default;

		await initTranslationObserver('es');
		await initTranslationObserver('en');
		await initTranslationObserver('es');

		expect(TranslationObserver).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();
		expect(changeLocale).toHaveBeenCalledTimes(2);
		expect(changeLocale).toHaveBeenLastCalledWith('es', '');
	});
});
