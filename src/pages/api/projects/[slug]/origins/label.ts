import type { APIRoute } from 'astro';
import { z } from 'zod';
import { setOriginLabel } from '../../../../../lib/server/client';
import {
	assertWritable,
	resolveSyncAccessRole,
} from '../../../../../lib/server/collaboration/access';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../../../../lib/server/http';

const labelSchema = z.object({
	originId: z.string().uuid(),
	label: z.string().max(64),
});

export const PUT: APIRoute = async ({ request }) => {
	try {
		assertWritable(await resolveSyncAccessRole());
		const body = labelSchema.parse(await parseJsonBody(request));
		await setOriginLabel(body.originId, body.label);
		return jsonResponse({ ok: true, originId: body.originId, label: body.label.trim() });
	} catch (e) {
		return toErrorResponse(e);
	}
};
