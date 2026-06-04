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
	import DialogNode from './DialogNode.svelte';

	interface Props {
		nodes: Node[];
		edges: Edge[];
		setNodes: (nodes: Node[]) => void;
		setEdges: (edges: Edge[]) => void;
		onNodeSelect: (nodeId: string) => void;
		onConnect: (connection: Connection) => void;
		onDragStop: () => void;
	}

	let { nodes, edges, setNodes, setEdges, onNodeSelect, onConnect, onDragStop }: Props =
		$props();

	const nodeTypes = {
		entry: DialogNode,
		line: DialogNode,
		choice: DialogNode,
		condition: DialogNode,
		set_var: DialogNode,
		jump: DialogNode,
		direction: DialogNode,
		end: DialogNode,
	};
</script>

<div class="editor-canvas">
	<SvelteFlow
		bind:nodes={() => (Array.isArray(nodes) ? nodes : []), setNodes}
		bind:edges={() => (Array.isArray(edges) ? edges : []), setEdges}
		{nodeTypes}
		fitView
		onnodeclick={({ node }) => onNodeSelect(node.id)}
		onconnect={(params) => onConnect(params)}
		onnodedragstop={onDragStop}
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
