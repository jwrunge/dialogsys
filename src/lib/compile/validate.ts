import type { CharactersFile } from '../schema/characters';
import type { DialogGraph } from '../schema/graph';

export type ValidationIssue = {
	level: 'error' | 'warning';
	code: string;
	message: string;
	dialogId?: string;
	nodeId?: string;
};

export function validateDialog(
	graph: DialogGraph,
	characters: CharactersFile,
	allDialogIds: string[],
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const charIds = new Set(characters.characters.map((c) => c.id));
	const nodeIds = new Set(graph.nodes.map((n) => n.id));
	const entryNodes = graph.nodes.filter((n) => n.type === 'entry');

	if (entryNodes.length === 0) {
		issues.push({
			level: 'error',
			code: 'missing_entry',
			message: 'Graph must have an entry node',
			dialogId: graph.id,
		});
	} else if (entryNodes.length > 1) {
		issues.push({
			level: 'warning',
			code: 'multiple_entry',
			message: 'Multiple entry nodes; first will be used',
			dialogId: graph.id,
		});
	}

	const reachable = new Set<string>();
	const entry = entryNodes[0];
	if (entry) {
		const queue = [entry.id];
		while (queue.length) {
			const id = queue.shift()!;
			if (reachable.has(id)) continue;
			reachable.add(id);
			for (const e of graph.edges.filter((ed) => ed.source === id)) {
				if (nodeIds.has(e.target)) queue.push(e.target);
			}
		}
	}

	for (const node of graph.nodes) {
		if (node.type === 'line') {
			if (!node.data.text?.trim()) {
				issues.push({
					level: 'warning',
					code: 'empty_line',
					message: 'Line node has no text',
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
			if (node.data.speaker && !charIds.has(node.data.speaker)) {
				issues.push({
					level: 'warning',
					code: 'unknown_speaker',
					message: `Unknown speaker "${node.data.speaker}"`,
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
		}

		if (node.type === 'choice') {
			const options = node.data.options ?? [];
			if (options.length === 0) {
				issues.push({
					level: 'error',
					code: 'empty_choice',
					message: 'Choice node has no options',
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
			for (const opt of options) {
				if (!opt.text?.trim()) {
					issues.push({
						level: 'error',
						code: 'empty_option',
						message: 'Choice option has no text',
						dialogId: graph.id,
						nodeId: node.id,
					});
				}
			}
		}

		if (node.type === 'jump') {
			const target = node.data.targetDialogId;
			if (!target || !allDialogIds.includes(target)) {
				issues.push({
					level: 'error',
					code: 'invalid_jump',
					message: `Jump target dialog "${target ?? ''}" not found`,
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
		}

		if (!reachable.has(node.id) && node.type !== 'direction') {
			issues.push({
				level: 'warning',
				code: 'unreachable',
				message: `Node "${node.id}" is unreachable from entry`,
				dialogId: graph.id,
				nodeId: node.id,
			});
		}
	}

	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
			issues.push({
				level: 'error',
				code: 'dangling_edge',
				message: `Edge ${edge.id} references missing node`,
				dialogId: graph.id,
			});
		}
	}

	return issues;
}

export function validateProject(
	graphs: DialogGraph[],
	characters: CharactersFile,
): ValidationIssue[] {
	const dialogIds = graphs.map((g) => g.id);
	return graphs.flatMap((g) => validateDialog(g, characters, dialogIds));
}
