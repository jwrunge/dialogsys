import type { APIRoute } from 'astro';
import {
	jsonResponse,
	savePortraitUpload,
	toErrorResponse,
} from '../../../../../lib/server/projects';

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const form = await request.formData();
		const file = form.get('file');
		const characterId = String(form.get('characterId') ?? '');
		const stateId = String(form.get('stateId') ?? '');

		if (!(file instanceof File)) {
			return toErrorResponse(new Error('Portrait file is required'));
		}

		const result = await savePortraitUpload(params.slug!, characterId, stateId, file);
		return jsonResponse(result);
	} catch (e) {
		return toErrorResponse(e);
	}
};
