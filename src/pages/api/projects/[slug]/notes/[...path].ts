import type { APIRoute } from 'astro';
import { notePatchRequestSchema } from '../../../../../lib/schema/note-patch';
import {
	applyNotePatch,
	GraphPatchConflictError,
	jsonResponse,
	parseJsonBody,
	readNoteWithHash,
	toErrorResponse,
	writeNote,
} from '../../../../../lib/server/projects';

function normalizeNotePath(pathParam: string | string[] | undefined): string {
	if (!pathParam) return 'overview.md';
	return Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
}

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const notePath = normalizeNotePath(params.path);

		const { content, contentHash } = await readNoteWithHash(slug, notePath);
		return jsonResponse({ path: notePath, content, contentHash });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const notePath = normalizeNotePath(params.path);
		const body = await parseJsonBody(request);
		const content =
			typeof (body as { content?: unknown }).content === 'string'
				? (body as { content: string }).content
				: '';
		await writeNote(slug, notePath, content);
		return jsonResponse({ ok: true, path: notePath });
	} catch (e) {
		return toErrorResponse(e);
	}
};

export const PATCH: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const notePath = normalizeNotePath(params.path);
		const body = notePatchRequestSchema.parse(await parseJsonBody(request));
		const result = await applyNotePatch(slug, notePath, body.baseContentHash, body.ops);
		return jsonResponse(result);
	} catch (e) {
		if (e instanceof GraphPatchConflictError) {
			return jsonResponse(
				{
					error: e.message,
					currentContentHash: e.currentContentHash,
					content: e.noteContent,
				},
				409,
			);
		}
		return toErrorResponse(e);
	}
};
