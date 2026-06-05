import type { APIRoute } from 'astro';
import { getFlow, saveFlow, jsonResponse, errorResponse } from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getFlow(params.slug!);
		return jsonResponse({ graph });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const graph = await saveFlow(params.slug!, body.graph ?? body);
		return jsonResponse({ graph });
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
