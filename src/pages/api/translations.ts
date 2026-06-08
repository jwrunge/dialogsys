import type { APIRoute } from 'astro';
import { parseLocaleTag } from '../../lib/i18n/locales';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../lib/server/http';
import {
	ensureTranslationsReady,
	getTranslationProvider,
	shouldTranslateTo,
} from '../../lib/server/translations';

function parseKeys(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((key): key is string => typeof key === 'string' && key.trim().length > 0);
	}
	if (typeof value === 'string' && value.trim()) {
		return value
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}
	return [];
}

export const POST: APIRoute = async ({ request, url }) => {
	try {
		const lang = url.searchParams.get('lang')?.trim();
		if (!lang) {
			return toErrorResponse(new Error('lang query parameter is required'), 400);
		}

		const region = url.searchParams.get('region')?.trim() ?? '';
		const localeTag = region ? `${lang}-${region}` : lang;

		const body = (await parseJsonBody(request).catch(() => ({}))) as { keys?: unknown };
		const keys = parseKeys(body.keys);
		if (keys.length === 0) {
			return jsonResponse({});
		}

		if (!shouldTranslateTo(localeTag)) {
			return jsonResponse({});
		}

		await ensureTranslationsReady();
		const provider = getTranslationProvider();
		const map = await provider({ langCode: parseLocaleTag(localeTag).langCode, region }, keys);
		return jsonResponse(map);
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
