import type { APIRoute } from 'astro';
import { hashFlowGraph } from '../../../../../lib/graph/content-hash';
import { flowGraphSchema } from '../../../../../lib/schema/flow';
import {
	deleteSequence,
	getSequence,
	jsonResponse,
	parseJsonBody,
	saveSequence,
	toErrorResponse,
} from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const graph = await getSequence(params.slug!, params.id!);
		return jsonResponse({ graph, contentHash: hashFlowGraph(graph) });
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
		const graph = flowGraphSchema.parse(raw);
		const saved = await saveSequence(slug, id, graph);
		return jsonResponse({ graph: saved });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		await deleteSequence(params.slug!, params.id!);
		return jsonResponse({ ok: true });
	} catch (e) {
		return toErrorResponse(e);
	}
};
