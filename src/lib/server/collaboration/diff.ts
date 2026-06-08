import { listOriginFiles, type SyncFileInfo } from '../../sync/client';
import { getSyncCredentials } from '../sync-credentials';

export type OriginDiffEntry = {
	path: string;
	kind: 'added' | 'removed' | 'modified';
	category: 'scene' | 'sequence' | 'characters' | 'state' | 'notes' | 'project' | 'other';
	fromHash?: string;
	toHash?: string;
};

export type OriginDiffResult = {
	fromOriginId: string;
	toOriginId: string;
	entries: OriginDiffEntry[];
};

function categorizePath(filePath: string): OriginDiffEntry['category'] {
	if (filePath === 'project.json') return 'project';
	if (filePath === 'characters.json') return 'characters';
	if (filePath === 'gameState.json') return 'state';
	if (filePath.startsWith('dialogs/') && filePath.endsWith('.graph.json')) return 'scene';
	if (filePath.startsWith('sequences/') && filePath.endsWith('.graph.json')) return 'sequence';
	if (filePath.startsWith('notes/')) return 'notes';
	return 'other';
}

function indexFiles(files: SyncFileInfo[]): Map<string, SyncFileInfo> {
	return new Map(files.map((file) => [file.path, file]));
}

export async function diffOriginThreads(
	slug: string,
	fromOriginId: string,
	toOriginId: string,
): Promise<OriginDiffResult> {
	const credentials = getSyncCredentials();
	const [fromFiles, toFiles] = await Promise.all([
		listOriginFiles(credentials, slug, fromOriginId),
		listOriginFiles(credentials, slug, toOriginId),
	]);

	const fromMap = indexFiles(fromFiles);
	const toMap = indexFiles(toFiles);
	const paths = new Set([...fromMap.keys(), ...toMap.keys()]);
	const entries: OriginDiffEntry[] = [];

	for (const filePath of [...paths].sort()) {
		const from = fromMap.get(filePath);
		const to = toMap.get(filePath);
		const category = categorizePath(filePath);

		if (!from && to) {
			entries.push({
				path: filePath,
				kind: 'added',
				category,
				toHash: to.contentHash,
			});
			continue;
		}
		if (from && !to) {
			entries.push({
				path: filePath,
				kind: 'removed',
				category,
				fromHash: from.contentHash,
			});
			continue;
		}
		if (from && to && from.contentHash !== to.contentHash) {
			entries.push({
				path: filePath,
				kind: 'modified',
				category,
				fromHash: from.contentHash,
				toHash: to.contentHash,
			});
		}
	}

	return { fromOriginId, toOriginId, entries };
}
