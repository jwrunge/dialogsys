import type { APIRoute } from 'astro';
import { validateProject } from '../../../../lib/compile/validate';
import { validateFlow } from '../../../../lib/flow/validateFlow';
import {
	listDialogs,
	getDialog,
	getCharacters,
	getFlow,
	jsonResponse,
	errorResponse,
} from '../../../../lib/server/projects';

export const POST: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const dialogList = await listDialogs(slug);
		const characters = await getCharacters(slug);
		const graphs = await Promise.all(
			dialogList.map((d) => getDialog(slug, d.id)),
		);
		const flow = await getFlow(slug);
		const dialogIds = dialogList.map((d) => d.id);
		const issues = [
			...validateProject(graphs, characters),
			...validateFlow(flow, dialogIds),
		];
		return jsonResponse({ issues });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};
