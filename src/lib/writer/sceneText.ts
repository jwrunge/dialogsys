import { nanoid } from 'nanoid';
import type { Character } from '../schema/characters';
import type { DialogGraph, GraphEdge, GraphNode } from '../schema/graph';
import { insertNodeAfter } from '../graph/graphEdit';
import { flattenActivePathWithDepth } from '../graph/pathTree';
import { getStartNodeId, nodeById } from '../graph/graphUtils';

const CHOICE_START = /^\[\[choice(?::([a-zA-Z0-9_-]+))?\]\]$/;
const CHOICE_END = /^\[\[\/choice\]\]$/;
const SPEAKER_LINE = /^([^:\n]+):\s*(.*)$/;

export type SceneTextLineBlock = {
	type: 'line';
	nodeId?: string;
	speaker: string;
	text: string;
};

export type SceneTextDirectionBlock = {
	type: 'direction';
	nodeId?: string;
	text: string;
};

export type SceneTextChoiceBlock = {
	type: 'choice';
	nodeId?: string;
	options: { id: string; text: string }[];
};

export type SceneTextMarkerBlock = {
	type: 'marker';
	nodeId: string;
	nodeType: GraphNode['type'];
	label: string;
};

export type SceneTextBlock =
	| SceneTextLineBlock
	| SceneTextDirectionBlock
	| SceneTextChoiceBlock
	| SceneTextMarkerBlock;

export function speakerLabel(speakerId: string, characters: Character[]): string {
	const char = characters.find((c) => c.id === speakerId);
	return char?.displayName?.trim() || speakerId;
}

export function resolveSpeaker(label: string, characters: Character[]): string {
	const trimmed = label.trim();
	if (!trimmed) return '';
	const byId = characters.find((c) => c.id.toLowerCase() === trimmed.toLowerCase());
	if (byId) return byId.id;
	const byName = characters.find(
		(c) => c.displayName.trim().toLowerCase() === trimmed.toLowerCase(),
	);
	return byName?.id ?? trimmed;
}

export function graphToSceneTextBlocks(
	graph: DialogGraph,
	characters: Character[],
	activeBranches: Record<string, string> = {},
): SceneTextBlock[] {
	const path = flattenActivePathWithDepth(graph.nodes, graph.edges, activeBranches);
	const blocks: SceneTextBlock[] = [];

	for (const step of path) {
		const node = nodeById(graph.nodes, step.id);
		if (!node) continue;

		if (node.type === 'line') {
			blocks.push({
				type: 'line',
				nodeId: node.id,
				speaker: speakerLabel(node.data.speaker ?? '', characters),
				text: node.data.text ?? '',
			});
			continue;
		}

		if (node.type === 'direction') {
			blocks.push({
				type: 'direction',
				nodeId: node.id,
				text: node.data.directionText ?? node.data.text ?? '',
			});
			continue;
		}

		if (node.type === 'choice') {
			blocks.push({
				type: 'choice',
				nodeId: node.id,
				options: (node.data.options ?? []).map((opt) => ({
					id: opt.id,
					text: opt.text,
				})),
			});
			continue;
		}

		if (node.type === 'set_var' || node.type === 'condition' || node.type === 'jump') {
			blocks.push({
				type: 'marker',
				nodeId: node.id,
				nodeType: node.type,
				label:
					node.type === 'set_var'
						? 'Set variable'
						: node.type === 'condition'
							? 'Condition'
							: `Jump → ${node.data.targetDialogId ?? '?'}`,
			});
		}
	}

	return blocks;
}

export function sceneTextBlocksToPlainText(blocks: SceneTextBlock[]): string {
	const lines: string[] = [];
	for (const block of blocks) {
		if (block.type === 'line') {
			lines.push(`${block.speaker}: ${block.text}`);
		} else if (block.type === 'direction') {
			lines.push(block.text);
		} else if (block.type === 'choice') {
			const id = block.nodeId ? `:${block.nodeId}` : '';
			lines.push(`[[choice${id}]]`);
			lines.push(block.options.map((opt) => opt.text).join('\t'));
			lines.push('[[/choice]]');
		} else if (block.type === 'marker') {
			lines.push(`[[${block.nodeType}:${block.nodeId}]]`);
		}
	}
	return `${lines.join('\n')}\n`;
}

export function parseSceneText(text: string): SceneTextBlock[] {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const blocks: SceneTextBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const raw = lines[i] ?? '';
		const line = raw.trimEnd();
		if (!line.trim()) {
			i += 1;
			continue;
		}

		const choiceStart = line.match(CHOICE_START);
		if (choiceStart) {
			const nodeId = choiceStart[1];
			i += 1;
			const optionLine = (lines[i] ?? '').trimEnd();
			i += 1;
			const options = optionLine
				? optionLine.split('\t').map((text) => ({ id: nanoid(8), text: text.trim() }))
				: [
						{ id: nanoid(8), text: 'Option A' },
						{ id: nanoid(8), text: 'Option B' },
					];
			if (lines[i]?.trim() !== '[[/choice]]') {
				throw new Error('Choice block must end with [[/choice]]');
			}
			i += 1;
			blocks.push({ type: 'choice', nodeId, options });
			continue;
		}

		if (CHOICE_END.test(line)) {
			throw new Error('Unexpected [[/choice]] without opening tag');
		}

		const marker = line.match(/^\[\[(set_var|condition|jump):([a-zA-Z0-9_-]+)\]\]$/);
		if (marker) {
			blocks.push({
				type: 'marker',
				nodeId: marker[2]!,
				nodeType: marker[1] as GraphNode['type'],
				label: marker[1]!,
			});
			i += 1;
			continue;
		}

		const speakerMatch = line.match(SPEAKER_LINE);
		if (speakerMatch && speakerMatch[1]!.trim() && speakerMatch[2] !== undefined) {
			blocks.push({
				type: 'line',
				speaker: speakerMatch[1]!.trim(),
				text: speakerMatch[2],
			});
			i += 1;
			continue;
		}

		blocks.push({ type: 'direction', text: line });
		i += 1;
	}

	return blocks;
}

function markerLabel(node: GraphNode): string {
	if (node.type === 'jump') return `Jump → ${node.data.targetDialogId ?? '?'}`;
	if (node.type === 'set_var') return 'Set variable';
	if (node.type === 'condition') return 'Condition';
	return node.type;
}

function pathContentNodes(
	graph: DialogGraph,
	activeBranches: Record<string, string>,
): GraphNode[] {
	const path = flattenActivePathWithDepth(graph.nodes, graph.edges, activeBranches);
	return path
		.map((step) => nodeById(graph.nodes, step.id))
		.filter((node): node is GraphNode => !!node)
		.filter((node) =>
			['line', 'direction', 'choice', 'set_var', 'condition', 'jump'].includes(node.type),
		);
}

function createLineNode(speaker: string, text: string): GraphNode {
	return {
		id: `line_${nanoid(6)}`,
		type: 'line',
		position: { x: 0, y: 0 },
		data: { speaker, text },
	};
}

function createDirectionNode(text: string): GraphNode {
	return {
		id: `dir_${nanoid(6)}`,
		type: 'direction',
		position: { x: 0, y: 0 },
		data: { directionText: text },
	};
}

function createChoiceNode(options: { id: string; text: string }[]): GraphNode {
	return {
		id: `choice_${nanoid(6)}`,
		type: 'choice',
		position: { x: 0, y: 0 },
		data: {
			options: options.map((opt) => ({
				id: opt.id,
				text: opt.text,
				conditions: [],
			})),
		},
	};
}

function anchorBeforeEnd(nodes: GraphNode[], edges: GraphEdge[]): string {
	const end = nodes.find((n) => n.type === 'end');
	if (end) {
		const incoming = edges.filter((e) => e.target === end.id);
		if (incoming[0]) return incoming[0].source;
	}
	const start = getStartNodeId(nodes, edges);
	return start ?? findEntryId(nodes) ?? end?.id ?? nodes[0]?.id ?? 'entry';
}

function findEntryId(nodes: GraphNode[]): string | undefined {
	return nodes.find((n) => n.type === 'entry')?.id;
}

export function applySceneTextBlocks(
	graph: DialogGraph,
	blocks: SceneTextBlock[],
	characters: Character[],
	activeBranches: Record<string, string> = {},
): DialogGraph {
	let nodes = [...graph.nodes];
	let edges = [...graph.edges];
	const pathNodes = pathContentNodes({ ...graph, nodes, edges }, activeBranches);
	let pathIndex = 0;

	const syncBlock = (block: SceneTextBlock, existing?: GraphNode) => {
		if (block.type === 'marker' && existing) {
			return;
		}

		if (block.type === 'line') {
			const speaker = resolveSpeaker(block.speaker, characters);
			if (existing?.type === 'line') {
				nodes = nodes.map((node) =>
					node.id === existing.id
						? { ...node, data: { ...node.data, speaker, text: block.text } }
						: node,
				);
				return;
			}
			const newNode = createLineNode(speaker, block.text);
			const afterId = pathIndex === 0 ? findEntryId(nodes) ?? anchorBeforeEnd(nodes, edges) : pathNodes[pathIndex - 1]?.id;
			if (afterId) {
				const inserted = insertNodeAfter(nodes, edges, afterId, newNode);
				nodes = inserted.nodes;
				edges = inserted.edges;
			}
			return;
		}

		if (block.type === 'direction') {
			if (existing?.type === 'direction') {
				nodes = nodes.map((node) =>
					node.id === existing.id
						? { ...node, data: { ...node.data, directionText: block.text } }
						: node,
				);
				return;
			}
			const newNode = createDirectionNode(block.text);
			const afterId =
				pathIndex === 0
					? (findEntryId(nodes) ?? anchorBeforeEnd(nodes, edges))
					: pathNodes[pathIndex - 1]?.id;
			if (afterId) {
				const inserted = insertNodeAfter(nodes, edges, afterId, newNode);
				nodes = inserted.nodes;
				edges = inserted.edges;
			}
			return;
		}

		if (block.type === 'choice') {
			const options = block.options.map((opt) => ({
				id: opt.id || nanoid(8),
				text: opt.text,
			}));
			if (existing?.type === 'choice') {
				nodes = nodes.map((node) =>
					node.id === existing.id
						? {
								...node,
								data: {
									...node.data,
									options: options.map((opt, index) => ({
										id: opt.id,
										text: opt.text,
										conditions: existing.data.options?.[index]?.conditions ?? [],
									})),
								},
							}
						: node,
				);
				return;
			}
			const newNode = createChoiceNode(options);
			const afterId =
				pathIndex === 0
					? (findEntryId(nodes) ?? anchorBeforeEnd(nodes, edges))
					: pathNodes[pathIndex - 1]?.id;
			if (afterId) {
				const inserted = insertNodeAfter(nodes, edges, afterId, newNode);
				nodes = inserted.nodes;
				edges = inserted.edges;
			}
		}
	};

	for (const block of blocks) {
		if (block.type === 'marker') {
			const existing = nodeById(nodes, block.nodeId);
			if (existing) {
				pathIndex += 1;
			}
			continue;
		}

		const existing = pathNodes[pathIndex];
		if (block.nodeId) {
			const explicit = nodeById(nodes, block.nodeId);
			syncBlock({ ...block, nodeId: block.nodeId }, explicit ?? existing);
		} else {
			syncBlock(block, existing);
		}
		pathIndex += 1;
	}

	return { ...graph, nodes, edges };
}

export function plainTextToGraph(
	graph: DialogGraph,
	text: string,
	characters: Character[],
	activeBranches: Record<string, string> = {},
): DialogGraph {
	return applySceneTextBlocks(graph, parseSceneText(text), characters, activeBranches);
}

export function graphToPlainSceneText(
	graph: DialogGraph,
	characters: Character[],
	activeBranches: Record<string, string> = {},
): string {
	return sceneTextBlocksToPlainText(graphToSceneTextBlocks(graph, characters, activeBranches));
}

export function markerBlocksFromGraph(graph: DialogGraph): SceneTextMarkerBlock[] {
	return graphToSceneTextBlocks(graph, []).filter(
		(block): block is SceneTextMarkerBlock => block.type === 'marker',
	);
}

export function markerNodeLabel(node: GraphNode): string {
	return markerLabel(node);
}
