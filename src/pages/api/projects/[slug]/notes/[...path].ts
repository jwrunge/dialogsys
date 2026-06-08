import type { APIRoute } from 'astro';
import {
	jsonResponse,
	parseJsonBody,
	readNote,
	toErrorResponse,
	writeNote,
} from '../../../../../lib/server/projects';

function normalizeNotePath(pathParam: string | string[] | undefined): string {
	if (!pathParam) return 'overview.md';
	return Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
}

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const notePath = normalizeNotePath(params.path);

		const content = await readNote(slug, notePath);
		return jsonResponse({ path: notePath, content });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const notePath = normalizeNotePath(params.path);
		const body = await parseJsonBody(request);
		const content =
			typeof (body as { content?: unknown }).content === 'string'
				? (body as { content: string }).content
				: '';
		await writeNote(slug, notePath, content);
		return jsonResponse({ ok: true, path: notePath });
	} catch (e) {
		return toErrorResponse(e);
	}
};
