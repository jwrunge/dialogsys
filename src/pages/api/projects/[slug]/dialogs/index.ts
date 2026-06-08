/** @deprecated Prefer `/api/projects/{slug}/scenes` — aliases the same handlers. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
	createDialog,
	jsonResponse,
	listDialogs,
	parseJsonBody,
	toErrorResponse,
} from '../../../../../lib/server/projects';

const createDialogBodySchema = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z][a-z0-9_]*$/),
	displayName: z.string().min(1).max(128),
});

export const GET: APIRoute = async ({ params }) => {
	try {
		const dialogs = await listDialogs(params.slug!);
		return jsonResponse({ dialogs });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const body = await parseJsonBody(request);
		const input = createDialogBodySchema.parse(body);
		const graph = await createDialog(params.slug!, input.id, input.displayName);
		return jsonResponse({ graph }, 201);
	} catch (e) {
		return toErrorResponse(e);
	}
};
