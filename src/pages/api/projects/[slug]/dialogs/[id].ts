/** @deprecated Prefer `/api/projects/{slug}/scenes/{id}` — aliases the same handlers. */
import type { APIRoute } from 'astro';
import { hashDialogGraph } from '../../../../../lib/graph/content-hash';
import { dialogGraphSchema } from '../../../../../lib/schema/graph';
import { updateDialogMetaPatchSchema } from '../../../../../lib/schema/patches';
import {
	deleteDialog,
	getDialog,
	jsonResponse,
	parseJsonBody,
	saveDialog,
	toErrorResponse,
	updateDialogMeta,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getDialog(params.slug!, params.id!);
		return jsonResponse({ graph, contentHash: hashDialogGraph(graph) });
	} catch (e) {
		return toErrorResponse(e, 404);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const id = params.id!;
		const body = await parseJsonBody(request);
		const raw = (body as { graph?: unknown }).graph ?? body;
		const graph = dialogGraphSchema.parse(raw);
		const saved = await saveDialog(slug, id, graph);
		return jsonResponse({ graph: saved });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const id = params.id!;
		const body = await parseJsonBody(request);
		const patch = updateDialogMetaPatchSchema.parse(body);
		const graph = await updateDialogMeta(slug, id, patch);
		return jsonResponse({ graph });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		const result = await deleteDialog(params.slug!, params.id!);
		return jsonResponse({ ok: true, ...result });
	} catch (e) {
		return toErrorResponse(e, 404);
	}
};
