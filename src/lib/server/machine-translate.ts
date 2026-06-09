const GOOGLE_LANG: Record<string, string> = {
	zh: 'zh-CN',
	pt: 'pt',
	he: 'iw',
};

const MAX_RETRIES = 3;

function googleLangCode(langCode: string): string {
	return GOOGLE_LANG[langCode] ?? langCode;
}

async function translateOne(text: string, langCode: string, attempt = 1): Promise<string> {
	const tl = googleLangCode(langCode);
	const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'dialogsys-i18n/1.0' },
			signal: AbortSignal.timeout(20_000),
		});
		if (!res.ok) {
			throw new Error(`Translate HTTP ${res.status}`);
		}
		const data = (await res.json()) as [Array<[string]>, ...unknown[]];
		return data[0].map((part) => part[0]).join('');
	} catch (error) {
		if (attempt >= MAX_RETRIES) throw error;
		await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
		return translateOne(text, langCode, attempt + 1);
	}
}

export function isMachineTranslateEnabled(): boolean {
	return process.env.DIALOGSYS_MACHINE_TRANSLATE !== 'false';
}

/** Translate English UI keys on demand (used when SQLite has no catalog for a locale). */
export async function machineTranslateKeys(
	keys: string[],
	langCode: string,
): Promise<Record<string, string>> {
	if (keys.length === 0) return {};

	const result: Record<string, string> = {};
	for (const key of keys) {
		try {
			result[key] = await translateOne(key, langCode);
		} catch {
			// Leave key untranslated on failure
		}
	}
	return result;
}
