import type { APIRoute } from 'astro';
import {
	getVariables,
	saveVariables,
	jsonResponse,
	errorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const data = await getVariables(params.slug!);
		return jsonResponse(data);
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const data = await saveVariables(params.slug!, body);
		return jsonResponse(data);
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
