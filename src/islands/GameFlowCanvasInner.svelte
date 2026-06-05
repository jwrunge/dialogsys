<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
		type Connection,
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
		onConnect: (connection: Connection) => void;
		onDragStop: () => void;
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
	}: Props = $props();

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
</script>

<div class="editor-canvas">
	<SvelteFlow
		bind:nodes={flowNodes}
		bind:edges={flowEdges}
		{nodeTypes}
		fitView
		onnodeclick={({ node }) => onNodeSelect(node.id)}
		onconnect={(params) => onConnect(params)}
		onnodedragstop={() => {
			pushToParent();
			onDragStop();
		}}
	>
		<Controls />
		<Background variant={BackgroundVariant.Dots} />
		<MiniMap />
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
</style>
