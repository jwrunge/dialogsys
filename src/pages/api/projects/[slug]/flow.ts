import type { APIRoute } from 'astro';
import { getSequence, saveSequence, jsonResponse, errorResponse } from '../../../../lib/server/projects';

/** @deprecated Use /api/projects/{slug}/sequences/main instead */
export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getSequence(params.slug!, 'main');
		return jsonResponse({ graph });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

/** @deprecated Use /api/projects/{slug}/sequences/main instead */
export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const graph = body.graph ?? body;
		const saved = await saveSequence(params.slug!, { ...graph, id: graph.id ?? 'main' });
		return jsonResponse({ graph: saved });
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
