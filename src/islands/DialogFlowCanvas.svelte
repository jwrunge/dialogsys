<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import DialogFlowCanvasInner from './DialogFlowCanvasInner.svelte';

	type FlowNode = {
		id: string;
		type?: string;
		position: { x: number; y: number };
		data?: Record<string, unknown>;
	};
	type FlowEdge = {
		id: string;
		source: string;
		target: string;
		sourceHandle?: string | null;
		targetHandle?: string | null;
		data?: Record<string, unknown>;
	};
	type FlowConnection = {
		source: string | null;
		target: string | null;
		sourceHandle?: string | null;
		targetHandle?: string | null;
	};

	interface Props {
		nodes: FlowNode[];
		edges: FlowEdge[];
		syncKey: string;
		setNodes: (nodes: FlowNode[]) => void;
		setEdges: (edges: FlowEdge[]) => void;
		onNodeSelect: (nodeId: string) => void;
		onConnect: (connection: FlowConnection) => void;
		onDragStop: () => void;
		onEdgeClick: (edge: FlowEdge) => void;
		onConnectEndToPane: (params: {
			sourceNodeId: string;
			sourceHandle: string | null;
			position: { x: number; y: number };
		}) => void;
	}

	let {
		nodes,
		edges,
		syncKey,
		setNodes,
		setEdges,
		onNodeSelect,
		onConnect,
		onDragStop,
		onEdgeClick,
		onConnectEndToPane,
	}: Props = $props();
</script>

<div class="editor-canvas-wrap">
	<SvelteFlowProvider>
		<DialogFlowCanvasInner
			{nodes}
			{edges}
			{syncKey}
			{setNodes}
			{setEdges}
			{onNodeSelect}
			{onConnect}
			{onDragStop}
			{onEdgeClick}
			{onConnectEndToPane}
		/>
	</SvelteFlowProvider>
</div>

<style>
	.editor-canvas-wrap {
		height: 100%;
		min-height: 500px;
	}
</style>
