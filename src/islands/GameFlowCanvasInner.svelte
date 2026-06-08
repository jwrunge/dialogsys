<script lang="ts">
import {
	Background,
	BackgroundVariant,
	type Edge,
	type Node,
	type OnConnectEnd,
	SvelteFlow,
	useSvelteFlow,
} from '@xyflow/svelte';
import '@xyflow/svelte/dist/style.css';
import FlowSceneNode from './FlowSceneNode.svelte';

interface Props {
	nodes: Node[];
	edges: Edge[];
	syncKey: string;
	setNodes: (nodes: Node[]) => void;
	setEdges: (edges: Edge[]) => void;
	onNodeSelect: (nodeId: string) => void;
	onConnect: () => void;
	onDragStop: () => void;
	onEdgeClick: (edge: Edge) => void;
	onConnectEndToPane: (params: {
		sourceNodeId: string;
		sourceHandle: string | null;
		position: { x: number; y: number };
	}) => void;
}

let {
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
	start: FlowSceneNode,
	scene: FlowSceneNode,
	branch: FlowSceneNode,
	end: FlowSceneNode,
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
		onconnect={() => {
			pushToParent();
			onConnect();
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

	/* xyflow defaults to 6px handles with pointer-events: none — enlarge visual + hit area */
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
