import type { APIRoute } from 'astro';
import {
	getProject,
	updateProject,
	jsonResponse,
	errorResponse,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const project = await getProject(slug);
		return jsonResponse({ project });
	} catch (e) {
		return errorResponse((e as Error).message, 404);
	}
};

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const body = await request.json();
		const project = await updateProject(slug, body);
		return jsonResponse({ project });
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
