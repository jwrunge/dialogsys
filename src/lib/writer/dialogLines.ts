import type { DialogGraph, GraphNode } from '../schema/graph';

export type DialogLineRow = {
	sceneId: string;
	nodeId: string;
	speaker: string;
	text: string;
};

export function extractDialogLines(graph: DialogGraph): DialogLineRow[] {
	const rows: DialogLineRow[] = [];
	for (const node of graph.nodes) {
		if (node.type !== 'line') continue;
		rows.push({
			sceneId: graph.id,
			nodeId: node.id,
			speaker: node.data.speaker?.trim() ?? '',
			text: node.data.text ?? '',
		});
	}
	return rows;
}

export function extractProjectLines(graphs: DialogGraph[]): DialogLineRow[] {
	return graphs.flatMap(extractDialogLines);
}

export function linesToCsv(rows: DialogLineRow[]): string {
	const header = 'scene_id,node_id,speaker,text';
	const body = rows.map((row) =>
		[row.sceneId, row.nodeId, row.speaker, row.text]
			.map((cell) => `"${cell.replace(/"/g, '""')}"`)
			.join(','),
	);
	return [header, ...body].join('\n') + '\n';
}

export function parseLinesCsv(csv: string): DialogLineRow[] {
	const lines = csv
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length === 0) return [];

	const header = lines[0].toLowerCase();
	const hasHeader = header.includes('scene_id') && header.includes('node_id');
	const dataLines = hasHeader ? lines.slice(1) : lines;

	return dataLines.map((line) => {
		const cells: string[] = [];
		let current = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i += 1;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}
			if (ch === ',' && !inQuotes) {
				cells.push(current);
				current = '';
				continue;
			}
			current += ch;
		}
		cells.push(current);
		return {
			sceneId: cells[0]?.trim() ?? '',
			nodeId: cells[1]?.trim() ?? '',
			speaker: cells[2]?.trim() ?? '',
			text: cells[3] ?? '',
		};
	});
}

export function applyLineUpdates(graph: DialogGraph, rows: DialogLineRow[]): DialogGraph {
	const byNode = new Map(rows.filter((r) => r.sceneId === graph.id).map((r) => [r.nodeId, r]));
	if (byNode.size === 0) return graph;

	const nodes: GraphNode[] = graph.nodes.map((node) => {
		if (node.type !== 'line') return node;
		const update = byNode.get(node.id);
		if (!update) return node;
		return {
			...node,
			data: {
				...node.data,
				speaker: update.speaker,
				text: update.text,
			},
		};
	});

	return { ...graph, nodes };
}
