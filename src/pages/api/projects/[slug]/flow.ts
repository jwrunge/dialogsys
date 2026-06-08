import type { APIRoute } from 'astro';
import { flowGraphSchema } from '../../../../lib/schema/flow';
import {
	getSequence,
	jsonResponse,
	parseJsonBody,
	saveSequence,
	toErrorResponse,
} from '../../../../lib/server/projects';

/** @deprecated Use /api/projects/{slug}/sequences/main instead */
export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getSequence(params.slug!, 'main');
		return jsonResponse({ graph });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

/** @deprecated Use /api/projects/{slug}/sequences/main instead */
export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const body = await parseJsonBody(request);
		const raw = (body as { graph?: unknown }).graph ?? body;
		const graph = flowGraphSchema.parse({ ...(raw as object), id: 'main' });
		const saved = await saveSequence(slug, 'main', graph);
		return jsonResponse({ graph: saved });
	} catch (e) {
		return toErrorResponse(e);
	}
};
