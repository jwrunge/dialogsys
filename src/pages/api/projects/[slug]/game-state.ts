import type { APIRoute } from 'astro';
import { gameStateFileSchema } from '../../../../lib/schema/gameState';
import {
	getGameState,
	jsonResponse,
	parseJsonBody,
	saveGameState,
	toErrorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const data = await getGameState(params.slug!);
		return jsonResponse(data);
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await parseJsonBody(request);
		const data = await saveGameState(params.slug!, gameStateFileSchema.parse(body));
		return jsonResponse(data);
	} catch (e) {
		return toErrorResponse(e);
	}
};
