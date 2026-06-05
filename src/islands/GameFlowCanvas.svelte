<script lang="ts">
	import { onMount } from 'svelte';

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
		<Inner
			{nodes}
			{edges}
			{syncKey}
			{setNodes}
			{setEdges}
			{onNodeSelect}
			{onConnect}
			{onDragStop}
		/>
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
