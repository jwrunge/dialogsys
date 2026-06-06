import { nanoid } from 'nanoid';
import type { GraphNode, GraphNodeData } from '../schema/graph';

/** Persistent data bag — fields for all types kept when switching type. */
export function emptyNodeData(): GraphNodeData {
	return {
		speaker: '',
		text: '',
		portraitPath: '',
		characterState: '',
		options: [
			{ id: nanoid(8), text: 'Option A', conditions: [] },
			{ id: nanoid(8), text: 'Option B', conditions: [] },
		],
		branchVar: '',
		branchScope: 'global',
		branchCharacterId: '',
		setOps: [],
		targetDialogId: '',
		directionText: '',
		sceneRef: '',
	};
}

export function createBlankNode(): GraphNode {
	return {
		id: `node_${nanoid(6)}`,
		type: 'blank',
		position: { x: 0, y: 0 },
		data: emptyNodeData(),
	};
}

export const NODE_TYPE_OPTIONS = [
	{ value: 'blank', label: 'Choose type…' },
	{ value: 'line', label: 'Line' },
	{ value: 'direction', label: 'Direction' },
	{ value: 'choice', label: 'Condition' },
	{ value: 'end', label: 'End' },
] as const;

export const LEGACY_NODE_TYPE_LABELS: Partial<Record<GraphNode['type'], string>> = {
	condition: 'Condition (deprecated)',
	set_var: 'Set variable',
	jump: 'Jump',
};
