import type { APIRoute } from 'astro';
import { validateProject } from '../../../../lib/compile/validate';
import { validateFlow } from '../../../../lib/flow/validateFlow';
import {
	getCharacters,
	getDialog,
	getSequence,
	jsonResponse,
	listDialogs,
	listSequences,
	toErrorResponse,
} from '../../../../lib/server/projects';

export const POST: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const dialogList = await listDialogs(slug);
		const characters = await getCharacters(slug);
		const graphs = await Promise.all(dialogList.map((d) => getDialog(slug, d.id)));
		const sequences = await listSequences(slug);
		const dialogIds = dialogList.map((d) => d.id);
		const sequenceIssues = await Promise.all(
			sequences.map(async (seq) => {
				const graph = await getSequence(slug, seq.id);
				return validateFlow(graph, dialogIds, seq.id);
			}),
		);
		const issues = [...validateProject(graphs, characters), ...sequenceIssues.flat()];
		return jsonResponse({ issues });
	} catch (e) {
		return toErrorResponse(e, 500);
	}
};
