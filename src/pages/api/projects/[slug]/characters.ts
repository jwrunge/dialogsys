import type { APIRoute } from 'astro';
import {
	getCharacters,
	saveCharacters,
	jsonResponse,
	errorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const data = await getCharacters(params.slug!);
		return jsonResponse(data);
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const data = await saveCharacters(params.slug!, body);
		return jsonResponse(data);
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
