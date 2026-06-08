import { characterById, resolvePortraitPath } from '../characters';
import type { Character } from '../schema/characters';
import type { ConditionGroup } from '../schema/conditions';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';

export type GodotDialogNode =
	| {
			type: 'line';
			speaker: string;
			text: string;
			portraitPath?: string;
			characterState?: string;
			emotion?: string;
			next: string;
	  }
	| {
			type: 'choice';
			options: {
				text: string;
				next: string;
				conditions: ConditionGroup[];
			}[];
	  }
	| {
			type: 'set_var';
			ops: { scope: string; characterId?: string; var: string; value: unknown }[];
			next: string;
	  }
	| {
			type: 'branch';
			scope: string;
			characterId?: string;
			var: string;
			trueNext: string;
			falseNext: string;
	  }
	| {
			type: 'jump';
			dialogId: string;
			entryNodeId?: string;
	  }
	| { type: 'end' };

export type GodotDialogExport = {
	id: string;
	start: string;
	nodes: Record<string, GodotDialogNode>;
};

function getOutgoing(edges: GraphEdge[], sourceId: string): GraphEdge[] {
	return edges.filter((e) => e.source === sourceId);
}

function singleNext(edges: GraphEdge[], sourceId: string, handle?: string): string {
	const out = getOutgoing(edges, sourceId);
	const filtered = handle
		? out.filter((e) => e.sourceHandle === handle || (!e.sourceHandle && handle === 'default'))
		: out;
	if (filtered.length === 0) return 'end';
	const target = filtered[0].target;
	const targetNode = target;
	return targetNode;
}

function resolveEnd(nodes: GraphNode[], nextId: string): string {
	const node = nodes.find((n) => n.id === nextId);
	if (!node) return 'end';
	if (node.type === 'end') return 'end';
	return nextId;
}

export function compileDialogToGodot(
	graph: DialogGraph,
	characters: Character[] = [],
	mapPortraitPath: (path: string) => string = (p) => p,
): GodotDialogExport {
	const exportableTypes = new Set([
		'entry',
		'line',
		'choice',
		'condition',
		'set_var',
		'jump',
		'end',
	]);
	const nodes: Record<string, GodotDialogNode> = {};
	const entry = graph.nodes.find((n) => n.type === 'entry');
	const startEdge = entry ? getOutgoing(graph.edges, entry.id)[0] : undefined;
	let start = startEdge?.target ?? 'end';
	start = resolveEnd(graph.nodes, start);

	for (const node of graph.nodes) {
		if (
			!exportableTypes.has(node.type) ||
			node.type === 'entry' ||
			node.type === 'direction' ||
			node.type === 'blank'
		) {
			continue;
		}

		if (node.type === 'end') {
			nodes[node.id] = { type: 'end' };
			nodes['end'] = { type: 'end' };
			continue;
		}

		if (node.type === 'line') {
			const nextRaw = singleNext(graph.edges, node.id);
			const speaker = node.data.speaker ?? '';
			const char = characterById(characters, speaker);
			const stateId = node.data.characterState?.trim() || char?.defaultStateId || undefined;
			const resolvedPortrait = resolvePortraitPath(char, stateId, node.data.portraitPath);
			nodes[node.id] = {
				type: 'line',
				speaker,
				text: node.data.text ?? '',
				portraitPath: resolvedPortrait ? mapPortraitPath(resolvedPortrait) || undefined : undefined,
				characterState: stateId,
				emotion: node.data.emotion || stateId || undefined,
				next: resolveEnd(graph.nodes, nextRaw),
			};
			continue;
		}

		if (node.type === 'choice') {
			const outEdges = getOutgoing(graph.edges, node.id);
			const options = (node.data.options ?? []).map((opt, i) => {
				const edge = outEdges.find((e) => e.sourceHandle === opt.id) ?? outEdges[i];
				const next = edge?.target ?? 'end';
				return {
					text: opt.text,
					next: resolveEnd(graph.nodes, next),
					conditions: opt.conditions ?? [],
				};
			});
			nodes[node.id] = { type: 'choice', options };
			continue;
		}

		if (node.type === 'set_var') {
			const nextRaw = singleNext(graph.edges, node.id);
			nodes[node.id] = {
				type: 'set_var',
				ops: node.data.setOps ?? [],
				next: resolveEnd(graph.nodes, nextRaw),
			};
			continue;
		}

		if (node.type === 'condition') {
			const out = getOutgoing(graph.edges, node.id);
			const forcedEdge = out.find((e) => e.data?.forceUse);
			const trueEdge = out.find((e) => e.data?.branch === 'true' || e.sourceHandle === 'true');
			const falseEdge = out.find((e) => e.data?.branch === 'false' || e.sourceHandle === 'false');

			let trueTarget = trueEdge?.target ?? 'end';
			let falseTarget = falseEdge?.target ?? 'end';

			if (node.data.forceBranch === 'true') {
				falseTarget = trueTarget;
			} else if (node.data.forceBranch === 'false') {
				trueTarget = falseTarget;
			} else if (forcedEdge) {
				trueTarget = falseTarget = forcedEdge.target;
			}

			nodes[node.id] = {
				type: 'branch',
				scope: node.data.branchScope ?? 'global',
				characterId: node.data.branchCharacterId,
				var: node.data.branchVar ?? '',
				trueNext: resolveEnd(graph.nodes, trueTarget),
				falseNext: resolveEnd(graph.nodes, falseTarget),
			};
			continue;
		}

		if (node.type === 'jump') {
			nodes[node.id] = {
				type: 'jump',
				dialogId: node.data.targetDialogId ?? '',
				entryNodeId: node.data.targetEntryNodeId,
			};
		}
	}

	if (!nodes['end']) {
		nodes['end'] = { type: 'end' };
	}

	return {
		id: graph.id,
		start,
		nodes,
	};
}
