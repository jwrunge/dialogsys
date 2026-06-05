import type { ValidationIssue } from '../compile/validate';
import type { FlowGraph } from '../schema/flow';

export function validateFlow(graph: FlowGraph, dialogIds: string[]): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const dialogIdSet = new Set(dialogIds);
	const nodeIds = new Set(graph.nodes.map((n) => n.id));

	for (const node of graph.nodes) {
		if (node.type === 'scene') {
			if (!node.data.dialogId?.trim()) {
				issues.push({
					level: 'warning',
					code: 'unassigned_scene',
					message: `Scene "${node.data.label || node.id}" has no dialog assigned`,
					flowNodeId: node.id,
				});
			} else if (!dialogIdSet.has(node.data.dialogId)) {
				issues.push({
					level: 'error',
					code: 'missing_scene',
					message: `Scene "${node.data.label || node.id}" references missing dialog "${node.data.dialogId}"`,
					flowNodeId: node.id,
				});
			}
		}

		if (node.type === 'branch') {
			const options = node.data.options ?? [];
			for (const opt of options) {
				const hasEdge = graph.edges.some(
					(e) =>
						e.source === node.id &&
						(e.sourceHandle === opt.id || (!e.sourceHandle && options.length === 1)),
				);
				if (!hasEdge) {
					issues.push({
						level: 'warning',
						code: 'dead_end_branch',
						message: `Branch "${node.data.label || node.id}" path "${opt.label}" has no outgoing connection`,
						flowNodeId: node.id,
					});
				}
			}
		}
	}

	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
			issues.push({
				level: 'error',
				code: 'dangling_flow_edge',
				message: `Flow connection ${edge.id} references a missing node`,
				edgeId: edge.id,
			});
		}
	}

	return issues;
}
