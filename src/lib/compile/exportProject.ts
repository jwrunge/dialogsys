import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { collectPortraitBundlePaths, portraitPathForExport } from '../portraits';
import type { Character, CharacterState } from '../schema/characters';
import { loadExportHooks } from '../server/plugins/load';
import {
	getCharacters,
	getDialog,
	listDialogs,
	portraitExists,
	readPortraitFile,
} from '../server/projects';
import { getPluginSettings } from '../server/settings';
import { compileDialogToGodot, type GodotDialogExport } from './dialogToGodot';
import { validateProject } from './validate';

export type ExportFormat = 'godot' | 'generic' | 'unity' | 'unreal';

export type ExportZipResult = {
	buffer: Buffer;
	filename: string;
	exportedAt: string;
	dialogCount: number;
	issues: ReturnType<typeof validateProject>;
};

type ZipEntry = { name: string; content: Buffer | string };

async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const archive = new ZipArchive({ zlib: { level: 9 } });
		const stream = new PassThrough();
		const chunks: Buffer[] = [];

		stream.on('data', (chunk: Buffer) => chunks.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('error', reject);
		archive.on('error', reject);
		archive.pipe(stream);

		for (const entry of entries) {
			archive.append(entry.content, { name: entry.name });
		}

		void archive.finalize();
	});
}

async function loadPortraitEntries(slug: string, relPaths: Set<string>): Promise<ZipEntry[]> {
	const entries: ZipEntry[] = [];
	for (const relPath of [...relPaths].sort()) {
		if (!(await portraitExists(slug, relPath))) continue;
		const { data } = await readPortraitFile(slug, relPath);
		entries.push({ name: relPath, content: data });
	}
	return entries;
}

function mapCharacterPortraits(characters: Character[], format: ExportFormat): Character[] {
	const mapPath = (p: string) => portraitPathForExport(p, format);
	return characters.map((char) => ({
		...char,
		portraitPath: char.portraitPath ? mapPath(char.portraitPath) : '',
		states: char.states.map((state: CharacterState) => ({
			...state,
			portraitPath: state.portraitPath ? mapPath(state.portraitPath) : '',
		})),
	}));
}

export async function buildExportZip(slug: string, format: ExportFormat): Promise<ExportZipResult> {
	const dialogList = await listDialogs(slug);
	const characters = await getCharacters(slug);
	const graphs = await Promise.all(dialogList.map((d) => getDialog(slug, d.id)));

	const issues = validateProject(graphs, characters);
	const errors = issues.filter((i) => i.level === 'error');
	if (errors.length > 0) {
		throw new Error(`Export blocked: ${errors.length} error(s). Fix validation issues first.`);
	}

	const exportedAt = new Date().toISOString();
	const mapPath = (p: string) => portraitPathForExport(p, format);
	const portraitPaths = collectPortraitBundlePaths(characters.characters, graphs);
	const portraitEntries = await loadPortraitEntries(slug, portraitPaths);

	const dialogExports: GodotDialogExport[] = graphs.map((graph) =>
		compileDialogToGodot(graph, characters.characters, mapPath),
	);

	const entries: ZipEntry[] = [];
	const root =
		format === 'godot'
			? 'godot'
			: format === 'unity'
				? 'unity'
				: format === 'unreal'
					? 'unreal'
					: 'generic';

	for (const compiled of dialogExports) {
		entries.push({
			name: `${root}/dialogs/${compiled.id}.json`,
			content: JSON.stringify(compiled, null, 2) + '\n',
		});
	}

	for (const portrait of portraitEntries) {
		entries.push({
			name: `${root}/${portrait.name}`,
			content: portrait.content,
		});
	}

	const manifest = {
		exportedAt,
		project: slug,
		format,
		dialogs: dialogList.map((d) => d.id),
		characters: characters.characters.map((c) => c.id),
		portraits: portraitEntries.map((p) => p.name),
	};

	entries.push({
		name: `${root}/manifest.json`,
		content: JSON.stringify(manifest, null, 2) + '\n',
	});

	if (format === 'unity') {
		const templatePath = path.resolve(process.cwd(), 'templates/unity/DialogueRunner.cs');
		const runner = await fs.readFile(templatePath, 'utf-8');
		entries.push({ name: `${root}/DialogueRunner.cs`, content: runner });
		entries.push({
			name: `${root}/characters.json`,
			content:
				JSON.stringify(
					{ characters: mapCharacterPortraits(characters.characters, format) },
					null,
					2,
				) + '\n',
		});
		entries.push({
			name: `${root}/README.txt`,
			content: [
				'Dialogsys Unity export',
				'',
				'Copy this folder into your Unity project (e.g. Assets/Dialogue/).',
				'Attach DialogueRunner.cs to a GameObject and load JSON from StreamingAssets or Resources.',
				'dialogs/ — scene JSON (same schema as Godot export)',
				'portraits/ — portrait images',
				'',
			].join('\n'),
		});
	} else if (format === 'unreal') {
		entries.push({
			name: `${root}/characters.json`,
			content:
				JSON.stringify(
					{ characters: mapCharacterPortraits(characters.characters, 'generic') },
					null,
					2,
				) + '\n',
		});
		entries.push({
			name: `${root}/README.txt`,
			content: [
				'Dialogsys Unreal export',
				'',
				'Import dialogs/*.json into DataTables or a custom UObject loader.',
				'Portrait paths are relative (portraits/…).',
				'See generic export schema — same dialog JSON node types as Godot.',
				'',
			].join('\n'),
		});
	} else if (format === 'generic') {
		entries.push({
			name: `${root}/characters.json`,
			content:
				JSON.stringify(
					{ characters: mapCharacterPortraits(characters.characters, format) },
					null,
					2,
				) + '\n',
		});
		entries.push({
			name: `${root}/README.txt`,
			content: [
				'Dialogsys generic export',
				'',
				'dialogs/ — scene JSON (same node schema as Godot export, portrait paths relative to this folder)',
				'characters.json — character definitions with resolved portrait paths',
				'portraits/ — portrait image files referenced by dialogs and characters',
				'manifest.json — export metadata',
				'',
			].join('\n'),
		});
	} else {
		const templatePath = path.resolve(process.cwd(), 'templates/godot/DialogueRunner.gd');
		const runner = await fs.readFile(templatePath, 'utf-8');
		entries.push({ name: `${root}/DialogueRunner.gd`, content: runner });
		entries.push({
			name: `${root}/README.txt`,
			content: [
				'Dialogsys Godot export',
				'',
				'Copy this folder into your game as res://dialogue/',
				'Autoload DialogueRunner.gd and set dialogue_root if needed.',
				'Portrait paths in JSON use res://dialogue/portraits/...',
				'',
			].join('\n'),
		});
	}

	let finalEntries = entries;
	const hookPaths = getPluginSettings().exportHooks ?? [];
	if (hookPaths.length > 0) {
		const hooks = await loadExportHooks(hookPaths);
		let ctx = { slug, format, entries: finalEntries };
		for (const hook of hooks) {
			ctx = await hook(ctx);
		}
		finalEntries = ctx.entries;
	}

	const buffer = await buildZip(finalEntries);

	return {
		buffer,
		filename: `${slug}-${format}-export.zip`,
		exportedAt,
		dialogCount: graphs.length,
		issues,
	};
}
