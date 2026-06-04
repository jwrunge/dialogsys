import type { APIRoute } from 'astro';
import {
	getDialog,
	saveDialog,
	deleteDialog,
	jsonResponse,
	errorResponse,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getDialog(params.slug!, params.id!);
		return jsonResponse({ graph });
	} catch (e) {
		return errorResponse((e as Error).message, 404);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const body = await request.json();
		const graph = await saveDialog(params.slug!, body.graph ?? body);
		return jsonResponse({ graph });
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		await deleteDialog(params.slug!, params.id!);
		return jsonResponse({ ok: true });
	} catch (e) {
		return errorResponse((e as Error).message, 404);
	}
};
