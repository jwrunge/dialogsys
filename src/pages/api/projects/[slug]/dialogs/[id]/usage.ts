import type { APIRoute } from 'astro';
import {
	getSceneSequenceUsage,
	jsonResponse,
	toErrorResponse,
} from '../../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const usages = await getSceneSequenceUsage(params.slug!, params.id!);
		return jsonResponse({ usages });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
