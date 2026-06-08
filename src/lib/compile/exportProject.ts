import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { collectPortraitBundlePaths, portraitPathForExport } from '../portraits';
import type { Character, CharacterState } from '../schema/characters';
import {
	getCharacters,
	getDialog,
	listDialogs,
	portraitExists,
	readPortraitFile,
} from '../server/projects';
import { compileDialogToGodot, type GodotDialogExport } from './dialogToGodot';
import { validateProject } from './validate';

export type ExportFormat = 'godot' | 'generic';

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
	const root = format === 'godot' ? 'godot' : 'generic';

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

	if (format === 'generic') {
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

	const buffer = await buildZip(entries);

	return {
		buffer,
		filename: `${slug}-${format}-export.zip`,
		exportedAt,
		dialogCount: graphs.length,
		issues,
	};
}
