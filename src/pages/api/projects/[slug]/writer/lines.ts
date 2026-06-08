import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../../../../lib/server/http';
import { getDialog, listDialogs, saveDialog } from '../../../../../lib/server/projects';
import {
	applyLineUpdates,
	extractDialogLines,
	extractProjectLines,
	linesToCsv,
	parseLinesCsv,
} from '../../../../../lib/writer/dialogLines';

export const GET: APIRoute = async ({ params, url }) => {
	try {
		const slug = params.slug!;
		const sceneId = url.searchParams.get('scene')?.trim();
		const format = url.searchParams.get('format') ?? 'json';

		if (sceneId) {
			const graph = await getDialog(slug, sceneId);
			const lines = extractDialogLines(graph);
			if (format === 'csv') {
				return new Response(linesToCsv(lines), {
					headers: { 'Content-Type': 'text/csv; charset=utf-8' },
				});
			}
			return jsonResponse({ lines });
		}

		const dialogList = await listDialogs(slug);
		const graphs = await Promise.all(dialogList.map((d) => getDialog(slug, d.id)));
		const lines = extractProjectLines(graphs);
		if (format === 'csv') {
			return new Response(linesToCsv(lines), {
				headers: { 'Content-Type': 'text/csv; charset=utf-8' },
			});
		}
		return jsonResponse({ lines });
	} catch (e) {
		return toErrorResponse(e);
	}
};

const importSchema = z.object({
	csv: z.string().optional(),
	lines: z
		.array(
			z.object({
				sceneId: z.string(),
				nodeId: z.string(),
				speaker: z.string(),
				text: z.string(),
			}),
		)
		.optional(),
	sceneId: z.string().optional(),
});

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const body = importSchema.parse(await parseJsonBody(request));
		const rows = body.lines ?? (body.csv ? parseLinesCsv(body.csv) : []);
		if (rows.length === 0) {
			return toErrorResponse(new Error('No lines to import'));
		}

		const sceneIds = body.sceneId
			? [body.sceneId]
			: [...new Set(rows.map((r) => r.sceneId).filter(Boolean))];
		if (sceneIds.length === 0) {
			return toErrorResponse(new Error('No scene_id values in import'));
		}

		let updated = 0;
		for (const sceneId of sceneIds) {
			const graph = await getDialog(slug, sceneId);
			const next = applyLineUpdates(graph, rows);
			if (JSON.stringify(next) !== JSON.stringify(graph)) {
				await saveDialog(slug, sceneId, next);
				updated += 1;
			}
		}

		return jsonResponse({ ok: true, updatedScenes: updated, lineCount: rows.length });
	} catch (e) {
		return toErrorResponse(e);
	}
};
