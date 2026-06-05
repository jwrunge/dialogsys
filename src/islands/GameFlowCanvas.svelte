<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';

	type InnerComponent = typeof import('./GameFlowCanvasInner.svelte').default;

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
	interface Props {
		nodes: FlowNode[];
		edges: FlowEdge[];
		syncKey: string;
		setNodes: (nodes: FlowNode[]) => void;
		setEdges: (edges: FlowEdge[]) => void;
		onNodeSelect: (nodeId: string) => void;
		onConnect: () => void;
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

	let Inner = $state<InnerComponent | null>(null);
	let loadError = $state('');

	onMount(async () => {
		try {
			const mod = await import('./GameFlowCanvasInner.svelte');
			Inner = mod.default;
		} catch (e) {
			loadError = (e as Error).message;
		}
	});
</script>

<div class="editor-canvas-wrap">
	{#if loadError}
		<p class="canvas-error">{loadError}</p>
	{:else if Inner}
		<SvelteFlowProvider>
			<Inner
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
	{:else}
		<p class="canvas-loading">Loading flow chart…</p>
	{/if}
</div>

<style>
	.editor-canvas-wrap {
		height: 100%;
		min-height: 500px;
	}

	.canvas-loading,
	.canvas-error {
		padding: 2rem;
		color: var(--text-muted);
	}

	.canvas-error {
		color: var(--error);
	}
</style>
