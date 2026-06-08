import type { APIRoute } from 'astro';
import { readPortraitFile, toErrorResponse } from '../../../../../lib/server/projects';

function normalizePortraitPath(pathParam: string | string[] | undefined): string {
	if (!pathParam) throw new Error('Portrait path is required');
	const joined = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
	return `portraits/${joined}`;
}

export const GET: APIRoute = async ({ params }) => {
	try {
		const relPath = normalizePortraitPath(params.path);
		const { data, mime } = await readPortraitFile(params.slug!, relPath);
		return new Response(new Uint8Array(data), {
			status: 200,
			headers: {
				'Content-Type': mime,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	} catch (e) {
		return toErrorResponse(e, 404);
	}
};
