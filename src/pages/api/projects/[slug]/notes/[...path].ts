import type { APIRoute } from 'astro';
import {
	readNote,
	writeNote,
	listDirectionNotes,
	jsonResponse,
	errorResponse,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params, url }) => {
	try {
		const slug = params.slug!;
		const notePath = params.path ?? 'overview.md';

		if (url.searchParams.get('list') === 'direction') {
			const files = await listDirectionNotes(slug);
			return jsonResponse({ files });
		}

		const content = await readNote(slug, notePath);
		return jsonResponse({ path: notePath, content });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const notePath = params.path ?? 'overview.md';
		const body = await request.json();
		await writeNote(slug, notePath, body.content ?? '');
		return jsonResponse({ ok: true, path: notePath });
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
