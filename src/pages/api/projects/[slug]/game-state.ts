import type { APIRoute } from 'astro';
import { gameStatePatchRequestSchema } from '../../../../lib/schema/game-state-patch';
import { gameStateFileSchema } from '../../../../lib/schema/gameState';
import {
	applyGameStatePatch,
	getGameStateWithHash,
	GraphPatchConflictError,
	jsonResponse,
	parseJsonBody,
	saveGameState,
	toErrorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const { gameState, contentHash } = await getGameStateWithHash(params.slug!);
		return jsonResponse({ ...gameState, contentHash });
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

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const body = gameStatePatchRequestSchema.parse(await parseJsonBody(request));
		const result = await applyGameStatePatch(slug, body.baseContentHash, body.ops);
		return jsonResponse(result);
	} catch (e) {
		if (e instanceof GraphPatchConflictError) {
			return jsonResponse(
				{
					error: e.message,
					path: e.path,
					currentContentHash: e.currentContentHash,
					gameState: e.gameState,
				},
				409,
			);
		}
		return toErrorResponse(e);
	}
};
