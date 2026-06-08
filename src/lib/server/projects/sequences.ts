import { createDefaultFlowGraph } from '../../flow/flowFactory';
import { type FlowGraph, flowGraphSchema, type SequenceListItem } from '../../schema/flow';
import { assertSafeRelative } from '../paths';
import {
	deleteFile,
	ensureDir,
	fileExists,
	listDir,
	readJsonFile,
	writeJsonFile,
} from '../storage';
import { touchProject } from './meta';

function assertSequenceId(id: string): void {
	assertSafeRelative(id);
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid sequence id');
}

function sequenceSegments(id: string): string[] {
	assertSequenceId(id);
	return ['sequences', `${id}.graph.json`];
}

async function readLegacyFlow(slug: string): Promise<FlowGraph | null> {
	const raw = await readJsonFile(slug, ['flow.graph.json'], null);
	if (!raw) return null;
	return flowGraphSchema.parse(raw);
}

export async function listSequences(slug: string): Promise<SequenceListItem[]> {
	await ensureDir(slug, 'sequences');
	const files = await listDir(slug, 'sequences');
	const results: SequenceListItem[] = [];

	for (const file of files) {
		if (!file.endsWith('.graph.json')) continue;
		const id = file.replace(/\.graph\.json$/, '');
		try {
			const graph = await getSequence(slug, id);
			results.push({
				id,
				displayName: graph.displayName,
				updatedAt: graph.updatedAt ?? '',
			});
		} catch {
			results.push({ id, displayName: id, updatedAt: '' });
		}
	}

	if (results.length === 0) {
		const legacy = await readLegacyFlow(slug);
		if (legacy) {
			results.push({
				id: legacy.id || 'main',
				displayName: legacy.displayName,
				updatedAt: legacy.updatedAt ?? '',
			});
		}
	}

	return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getSequence(slug: string, id: string): Promise<FlowGraph> {
	const raw = await readJsonFile(slug, sequenceSegments(id), null);
	if (raw) {
		const graph = flowGraphSchema.parse(raw);
		return { ...graph, id };
	}

	if (id === 'main') {
		const legacy = await readLegacyFlow(slug);
		if (legacy) return { ...legacy, id: legacy.id || 'main' };
	}

	const graph = createDefaultFlowGraph(id);
	await saveSequence(slug, id, graph);
	return graph;
}

export async function saveSequence(
	slug: string,
	expectedId: string,
	graph: FlowGraph,
): Promise<FlowGraph> {
	assertSequenceId(expectedId);
	const parsed = flowGraphSchema.parse({
		...graph,
		id: expectedId,
		updatedAt: new Date().toISOString(),
	});
	if (parsed.id !== expectedId) {
		throw new Error('Sequence id does not match URL');
	}
	await writeJsonFile(slug, sequenceSegments(parsed.id), parsed);
	await touchProject(slug);
	return parsed;
}

export async function createSequence(
	slug: string,
	input: { id: string; displayName: string },
): Promise<FlowGraph> {
	assertSequenceId(input.id);
	if (await fileExists(slug, ...sequenceSegments(input.id))) {
		throw new Error('Sequence already exists');
	}

	const graph = createDefaultFlowGraph(input.id, input.displayName.trim());
	return saveSequence(slug, input.id, graph);
}

export async function deleteSequence(slug: string, id: string): Promise<void> {
	if (id === 'main') throw new Error('Cannot delete the main sequence');
	await deleteFile(slug, ...sequenceSegments(id));
	await touchProject(slug);
}
