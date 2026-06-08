import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
	createSequence,
	jsonResponse,
	listSequences,
	parseJsonBody,
	toErrorResponse,
} from '../../../../../lib/server/projects';

const createSequenceBodySchema = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z][a-z0-9_]*$/),
	displayName: z.string().min(1).max(128),
});

export const GET: APIRoute = async ({ params }) => {
	try {
		const sequences = await listSequences(params.slug!);
		return jsonResponse({ sequences });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const body = await parseJsonBody(request);
		const input = createSequenceBodySchema.parse(body);
		const graph = await createSequence(params.slug!, input);
		return jsonResponse({ graph }, 201);
	} catch (e) {
		return toErrorResponse(e);
	}
};
