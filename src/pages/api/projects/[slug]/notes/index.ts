import type { APIRoute } from 'astro';
import { listDirectionNotes, jsonResponse, errorResponse } from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params, url }) => {
	try {
		if (url.searchParams.get('list') === 'direction') {
			const files = await listDirectionNotes(params.slug!);
			return jsonResponse({ files });
		}
		return errorResponse('Unknown notes request', 400);
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};
