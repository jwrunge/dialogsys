import type { APIRoute } from 'astro';
import { charactersFileSchema } from '../../../../lib/schema/characters';
import { charactersPatchRequestSchema } from '../../../../lib/schema/characters-patch';
import {
	applyCharactersPatch,
	getCharactersWithHash,
	GraphPatchConflictError,
	jsonResponse,
	parseJsonBody,
	saveCharacters,
	toErrorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const { characters, contentHash } = await getCharactersWithHash(params.slug!);
		return jsonResponse({ ...characters, contentHash });
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

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const body = charactersPatchRequestSchema.parse(await parseJsonBody(request));
		const result = await applyCharactersPatch(slug, body.baseContentHash, body.ops);
		return jsonResponse(result);
	} catch (e) {
		if (e instanceof GraphPatchConflictError) {
			return jsonResponse(
				{
					error: e.message,
					currentContentHash: e.currentContentHash,
					characters: e.characters,
				},
				409,
			);
		}
		return toErrorResponse(e);
	}
};
