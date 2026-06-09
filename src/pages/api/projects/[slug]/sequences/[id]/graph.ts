import type { APIRoute } from 'astro';
import { flowPatchRequestSchema } from '../../../../../../lib/schema/flow-patch';
import {
	applySequenceGraphPatch,
	GraphPatchConflictError,
	jsonResponse,
	parseJsonBody,
	toErrorResponse,
} from '../../../../../../lib/server/projects';

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const id = params.id!;
		const body = flowPatchRequestSchema.parse(await parseJsonBody(request));
		const result = await applySequenceGraphPatch(slug, id, body.baseContentHash, body.ops);
		return jsonResponse(result);
	} catch (e) {
		if (e instanceof GraphPatchConflictError) {
			return jsonResponse(
				{
					error: e.message,
					currentContentHash: e.currentContentHash,
					graph: e.graph,
				},
				409,
			);
		}
		return toErrorResponse(e);
	}
};
