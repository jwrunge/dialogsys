import type { APIRoute } from 'astro';
import {
	listSequences,
	createSequence,
	jsonResponse,
	errorResponse,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const sequences = await listSequences(params.slug!);
		return jsonResponse({ sequences });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const graph = await createSequence(params.slug!, {
			id: body.id,
			displayName: body.displayName,
		});
		return jsonResponse({ graph }, 201);
	} catch (e) {
		const msg = (e as Error).message;
		const status = msg.includes('already exists') ? 409 : 400;
		return errorResponse(msg, status);
	}
};
