import type { APIRoute } from 'astro';
import { charactersFileSchema } from '../../../../lib/schema/characters';
import {
	getCharacters,
	jsonResponse,
	parseJsonBody,
	saveCharacters,
	toErrorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const data = await getCharacters(params.slug!);
		return jsonResponse(data);
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await parseJsonBody(request);
		const data = await saveCharacters(params.slug!, charactersFileSchema.parse(body));
		return jsonResponse(data);
	} catch (e) {
		return toErrorResponse(e);
	}
};
