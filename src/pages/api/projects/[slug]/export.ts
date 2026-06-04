import type { APIRoute } from 'astro';
import { exportProjectToGodot } from '../../../../lib/compile/exportProject';
import { jsonResponse, errorResponse } from '../../../../lib/server/projects';

export const POST: APIRoute = async ({ params }) => {
	try {
		const result = await exportProjectToGodot(params.slug!);
		return jsonResponse(result);
	} catch (e) {
		return errorResponse((e as Error).message, 400);
	}
};
