import { nanoid } from 'nanoid';
import type { FlowGraph, FlowNode } from '../schema/flow';

export function createDefaultFlowGraph(
	id = 'main',
	displayName = 'Main sequence',
): FlowGraph {
	return {
		id,
		displayName,
		nodes: [
			{
				id: 'start',
				type: 'start',
				position: { x: 80, y: 200 },
				data: { label: 'Game start' },
			},
			{
				id: 'end',
				type: 'end',
				position: { x: 520, y: 200 },
				data: { label: 'Game end' },
			},
		],
		edges: [],
	};
}

export function createSceneNode(position = { x: 300, y: 200 }): FlowNode {
	return {
		id: `scene_${nanoid(6)}`,
		type: 'scene',
		position,
		data: { label: 'New scene' },
	};
}

export function createBranchNode(position = { x: 300, y: 200 }): FlowNode {
	return {
		id: `branch_${nanoid(6)}`,
		type: 'branch',
		position,
		data: {
			label: 'Branch',
			options: [],
		},
	};
}
