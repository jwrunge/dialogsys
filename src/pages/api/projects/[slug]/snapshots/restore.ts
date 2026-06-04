import type { APIRoute } from 'astro';
import {
	restoreSnapshot,
	checkGitAvailable,
	GitUnavailableError,
} from '../../../../../lib/server/versioning';
import { jsonResponse, errorResponse } from '../../../../../lib/server/projects';

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const git = await checkGitAvailable();
		if (!git.available) {
			return errorResponse(git.message, 503);
		}
		const body = await request.json();
		const ref = body.ref ?? body.branch;
		if (!ref || typeof ref !== 'string') {
			return errorResponse('ref or branch required', 400);
		}
		await restoreSnapshot(slug, ref);
		return jsonResponse({ ok: true, restored: ref });
	} catch (e) {
		if (e instanceof GitUnavailableError) {
			return errorResponse(e.message, 503);
		}
		return errorResponse((e as Error).message, 400);
	}
};
