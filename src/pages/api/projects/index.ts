import type { APIRoute } from 'astro';
import {
	listProjects,
	createProject,
	jsonResponse,
	errorResponse,
} from '../../../lib/server/projects';

export const GET: APIRoute = async () => {
	try {
		const projects = await listProjects();
		return jsonResponse({ projects });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json();
		const project = await createProject(body);
		return jsonResponse({ project }, 201);
	} catch (e) {
		const msg = (e as Error).message;
		const status = msg.includes('already exists') ? 409 : 400;
		return errorResponse(msg, status);
	}
};
