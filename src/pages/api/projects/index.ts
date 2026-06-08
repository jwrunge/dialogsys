import type { APIRoute } from 'astro';
import { createProjectInputSchema } from '../../../lib/schema/project';
import {
	createProject,
	jsonResponse,
	listProjects,
	parseJsonBody,
	toErrorResponse,
} from '../../../lib/server/projects';

export const GET: APIRoute = async () => {
	try {
		const projects = await listProjects();
		return jsonResponse({ projects });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonBody(request);
		const input = createProjectInputSchema.parse(body);
		const project = await createProject(input);
		return jsonResponse({ project }, 201);
	} catch (e) {
		return toErrorResponse(e);
	}
};
