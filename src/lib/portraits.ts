import type { Character } from './schema/characters';
import type { DialogGraph } from './schema/graph';

const PORTRAIT_EXT = /\.(png|jpe?g|webp|gif)$/i;

export function projectPortraitRelPath(characterId: string, stateId: string, ext = 'png'): string {
	const safeExt = ext.replace(/^\./, '').toLowerCase() || 'png';
	return `portraits/${characterId}_${stateId}.${safeExt}`;
}

export function isProjectPortraitPath(path: string | undefined): boolean {
	const p = path?.trim() ?? '';
	return p.startsWith('portraits/') && !p.includes('..') && !p.includes('\\');
}

/** Project files stored as binary on disk (synced as base64 in remote mode). */
export function isBinaryProjectPath(relPath: string): boolean {
	return relPath.startsWith('portraits/');
}

export function portraitFileName(path: string): string | null {
	const trimmed = path.trim();
	if (!trimmed) return null;
	const slash = trimmed.lastIndexOf('/');
	return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** Map legacy res:// paths to a project-relative portraits/ path for bundling. */
export function legacyPortraitRelPath(path: string | undefined): string | null {
	const p = path?.trim() ?? '';
	if (!p.startsWith('res://')) return null;
	const name = portraitFileName(p.replace(/^res:\/\//, ''));
	if (!name || !PORTRAIT_EXT.test(name)) return null;
	return `portraits/${name}`;
}

export function portraitPathForPreview(slug: string, path: string | undefined): string | null {
	const p = path?.trim() ?? '';
	if (!p) return null;
	if (p.startsWith('http://') || p.startsWith('https://')) return p;
	if (p.startsWith('/')) return p;
	if (isProjectPortraitPath(p)) {
		return `/api/projects/${slug}/portraits/${p.slice('portraits/'.length)}`;
	}
	return null;
}

export function portraitPathForExport(
	path: string,
	format: 'godot' | 'generic' | 'unity' | 'unreal',
): string {
	const p = path.trim();
	if (!p) return '';
	if (p.startsWith('http://') || p.startsWith('https://')) return p;

	const rel = isProjectPortraitPath(p) ? p : (legacyPortraitRelPath(p) ?? p);

	if (format === 'generic' || format === 'unity' || format === 'unreal') {
		if (rel.startsWith('portraits/')) return rel;
		return p;
	}

	// Godot: bundle under res://dialogue/
	if (rel.startsWith('portraits/')) {
		return `res://dialogue/${rel}`;
	}
	if (p.startsWith('res://')) {
		const legacy = legacyPortraitRelPath(p);
		if (legacy) return `res://dialogue/${legacy}`;
		return p;
	}
	return p;
}

export function collectPortraitBundlePaths(
	characters: Character[],
	graphs: DialogGraph[],
): Set<string> {
	const paths = new Set<string>();

	function add(path: string | undefined) {
		if (!path?.trim()) return;
		if (isProjectPortraitPath(path)) {
			paths.add(path.trim());
			return;
		}
		const legacy = legacyPortraitRelPath(path);
		if (legacy) paths.add(legacy);
	}

	for (const char of characters) {
		add(char.portraitPath);
		for (const state of char.states) {
			add(state.portraitPath);
		}
	}

	for (const graph of graphs) {
		for (const node of graph.nodes) {
			if (node.type === 'line') {
				add(node.data.portraitPath);
			}
		}
	}

	return paths;
}
