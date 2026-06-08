import type { APIRoute } from 'astro';
import { updateProjectPatchSchema } from '../../../../lib/schema/patches';
import {
	getProject,
	jsonResponse,
	parseJsonBody,
	toErrorResponse,
	updateProject,
} from '../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const project = await getProject(params.slug!);
		return jsonResponse({ project });
	} catch (e) {
		return toErrorResponse(e, 404);
	}
};

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const body = await parseJsonBody(request);
		const patch = updateProjectPatchSchema.parse(body);
		const project = await updateProject(params.slug!, patch);
		return jsonResponse({ project });
	} catch (e) {
		return toErrorResponse(e);
	}
};
