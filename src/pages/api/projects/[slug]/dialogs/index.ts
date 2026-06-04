import type { APIRoute } from 'astro';
import {
	listDialogs,
	createDialog,
	jsonResponse,
	errorResponse,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const dialogs = await listDialogs(params.slug!);
		return jsonResponse({ dialogs });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const graph = await createDialog(params.slug!, body.id, body.displayName);
		return jsonResponse({ graph }, 201);
	} catch (e) {
		const msg = (e as Error).message;
		const status = msg.includes('already exists') ? 409 : 400;
		return errorResponse(msg, status);
	}
};
