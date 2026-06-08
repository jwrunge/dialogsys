<script lang="ts">
import {
	Background,
	BackgroundVariant,
	type Connection,
	type Edge,
	type Node,
	type OnConnectEnd,
	SvelteFlow,
	useSvelteFlow,
} from '@xyflow/svelte';
import { setContext } from 'svelte';
import '@xyflow/svelte/dist/style.css';
import { DIALOG_CHARACTERS_KEY, type DialogCharactersContext } from '../lib/graph/dialogContext';
import type { Character } from '../lib/schema/characters';
import DialogNode from './DialogNode.svelte';

interface Props {
	characters?: Character[];
	nodes: Node[];
	edges: Edge[];
	syncKey: string;
	setNodes: (nodes: Node[]) => void;
	setEdges: (edges: Edge[]) => void;
	onNodeSelect: (nodeId: string) => void;
	onConnect: (connection: Connection) => void;
	onDragStop: () => void;
	onEdgeClick: (edge: Edge) => void;
	onConnectEndToPane: (params: {
		sourceNodeId: string;
		sourceHandle: string | null;
		position: { x: number; y: number };
	}) => void;
}

let {
	characters = [],
	nodes: propNodes,
	edges: propEdges,
	syncKey,
	setNodes,
	setEdges,
	onNodeSelect,
	onConnect,
	onDragStop,
	onEdgeClick,
	onConnectEndToPane,
}: Props = $props();

const { screenToFlowPosition } = useSvelteFlow();

setContext<DialogCharactersContext>(DIALOG_CHARACTERS_KEY, () => characters);

let flowNodes = $state.raw<Node[]>([]);
let flowEdges = $state.raw<Edge[]>([]);

function copyFromProps() {
	flowNodes = Array.isArray(propNodes) ? [...propNodes] : [];
	flowEdges = Array.isArray(propEdges) ? [...propEdges] : [];
}

function pushToParent() {
	setNodes([...flowNodes]);
	setEdges([...flowEdges]);
}

let lastSyncKey = '';

$effect.pre(() => {
	if (syncKey === lastSyncKey) return;
	lastSyncKey = syncKey;
	copyFromProps();
});

const nodeTypes = {
	entry: DialogNode,
	blank: DialogNode,
	line: DialogNode,
	choice: DialogNode,
	condition: DialogNode,
	set_var: DialogNode,
	jump: DialogNode,
	direction: DialogNode,
	end: DialogNode,
};

const proOptions = { hideAttribution: true };

const handleConnectEnd: OnConnectEnd = (event, connectionState) => {
	if (connectionState.isValid || !connectionState.fromNode) return;

	const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0]?.clientX;
	const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0]?.clientY;
	if (clientX == null || clientY == null) return;

	onConnectEndToPane({
		sourceNodeId: connectionState.fromNode.id,
		sourceHandle: connectionState.fromHandle?.id ?? null,
		position: screenToFlowPosition({ x: clientX, y: clientY }),
	});
};
</script>

<div class="editor-canvas">
	<SvelteFlow
		bind:nodes={flowNodes}
		bind:edges={flowEdges}
		{nodeTypes}
		{proOptions}
		colorMode="dark"
		connectionRadius={80}
		fitView
		onnodeclick={({ node }) => onNodeSelect(node.id)}
		onconnect={(params) => {
			pushToParent();
			onConnect(params);
		}}
		onconnectend={handleConnectEnd}
		onedgeclick={({ edge }) => onEdgeClick(edge)}
		onnodedragstop={() => {
			pushToParent();
			onDragStop();
		}}
	>
		<Background variant={BackgroundVariant.Dots} />
	</SvelteFlow>
</div>

<style>
	.editor-canvas {
		height: 100%;
		min-height: 500px;
	}

	:global(.svelte-flow) {
		background: var(--bg);
	}

	.editor-canvas :global(.svelte-flow__handle) {
		width: 18px;
		height: 18px;
		min-width: 18px;
		min-height: 18px;
		border-width: 2px;
		pointer-events: all;
		cursor: crosshair;
	}

	.editor-canvas :global(.svelte-flow__handle::before) {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 54px;
		height: 54px;
		transform: translate(-50%, -50%);
	}
</style>
