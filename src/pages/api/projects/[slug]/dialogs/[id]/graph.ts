import type { APIRoute } from 'astro';
import { graphPatchRequestSchema } from '../../../../../../lib/schema/graph-patch';
import {
	applyDialogGraphPatch,
	GraphPatchConflictError,
	jsonResponse,
	parseJsonBody,
	toErrorResponse,
} from '../../../../../../lib/server/projects';

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const id = params.id!;
		const body = graphPatchRequestSchema.parse(await parseJsonBody(request));
		const result = await applyDialogGraphPatch(slug, id, body.baseContentHash, body.ops);
		return jsonResponse(result);
	} catch (e) {
		if (e instanceof GraphPatchConflictError) {
			return jsonResponse(
				{
					error: e.message,
					path: e.path,
					currentContentHash: e.currentContentHash,
					graph: e.graph,
				},
				409,
			);
		}
		return toErrorResponse(e);
	}
};
