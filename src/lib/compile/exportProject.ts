import fs from 'node:fs/promises';
import path from 'node:path';
import { compileDialogToGodot } from './dialogToGodot';
import { validateProject } from './validate';
import {
	getCharacters,
	listDialogs,
	getDialog,
	projectFilePath,
	writeJsonAtomic,
} from '../server/projects';

export async function exportProjectToGodot(slug: string): Promise<{
	exportedAt: string;
	dialogCount: number;
	issues: ReturnType<typeof validateProject>;
}> {
	const dialogList = await listDialogs(slug);
	const characters = await getCharacters(slug);
	const graphs = await Promise.all(dialogList.map((d) => getDialog(slug, d.id)));

	const issues = validateProject(graphs, characters);
	const errors = issues.filter((i) => i.level === 'error');
	if (errors.length > 0) {
		throw new Error(
			`Export blocked: ${errors.length} error(s). Fix validation issues first.`,
		);
	}

	const exportDir = projectFilePath(slug, 'export', 'godot');
	const dialogsDir = path.join(exportDir, 'dialogs');
	await fs.mkdir(dialogsDir, { recursive: true });

	for (const graph of graphs) {
		const compiled = compileDialogToGodot(graph, characters.characters);
		await writeJsonAtomic(
			path.join(dialogsDir, `${graph.id}.json`),
			compiled,
		);
	}

	const exportedAt = new Date().toISOString();
	const manifest = {
		exportedAt,
		project: slug,
		dialogs: dialogList.map((d) => d.id),
		characters: characters.characters.map((c) => c.id),
	};

	await writeJsonAtomic(path.join(exportDir, 'manifest.json'), manifest);

	const templatePath = path.resolve(
		process.cwd(),
		'templates/godot/DialogueRunner.gd',
	);
	const destPath = path.join(exportDir, 'DialogueRunner.gd');
	await fs.copyFile(templatePath, destPath);

	return {
		exportedAt,
		dialogCount: graphs.length,
		issues,
	};
}
