import type { APIRoute } from 'astro';
import { scheduleSnapshot } from '../../../../../lib/server/versioning';
import { jsonResponse, errorResponse } from '../../../../../lib/server/projects';

export const POST: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const snapshot = await scheduleSnapshot(slug, 'interval autosave');
		return jsonResponse({ ok: true, snapshot });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};
