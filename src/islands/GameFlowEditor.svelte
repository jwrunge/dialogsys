<script lang="ts">
	import { onMount } from 'svelte';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type { DialogListItem } from '../lib/server/projects';
	import type { FlowGraph, FlowNode, FlowEdge } from '../lib/schema/flow';
	import { createBranchNode, createSceneNode } from '../lib/flow/flowFactory';
	import GameFlowCanvas from './GameFlowCanvas.svelte';
	import FlowNodeInspector from './FlowNodeInspector.svelte';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	type CanvasNode = {
		id: string;
		type?: string;
		position: { x: number; y: number };
		data?: Record<string, unknown>;
	};
	type CanvasEdge = {
		id: string;
		source: string;
		target: string;
		sourceHandle?: string | null;
		targetHandle?: string | null;
		data?: Record<string, unknown>;
	};

	let loading = $state(true);
	let ready = $state(false);
	let loadError = $state('');
	let saveStatus = $state('');
	let selectedNodeId = $state<string | null>(null);
	let dialogs = $state<DialogListItem[]>([]);
	let syncKey = $state('');

	let flowNodes = $state<FlowNode[]>([]);
	let flowEdges = $state<FlowEdge[]>([]);
	let canvasNodes = $state.raw<CanvasNode[]>([]);
	let canvasEdges = $state.raw<CanvasEdge[]>([]);

	const selectedNode = $derived(
		selectedNodeId ? (flowNodes.find((n) => n.id === selectedNodeId) ?? null) : null,
	);

	function toCanvas(graph: FlowGraph) {
		canvasNodes = graph.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		}));
		canvasEdges = graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		}));
		syncKey = `${graph.updatedAt ?? Date.now()}`;
	}

	function fromCanvas(): FlowGraph {
		return {
			id: 'main',
			displayName: 'Game flow',
			nodes: canvasNodes.map((n) => ({
				id: n.id,
				type: n.type as FlowNode['type'],
				position: n.position,
				data: (n.data ?? {}) as FlowNode['data'],
			})),
			edges: canvasEdges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				sourceHandle: e.sourceHandle ?? undefined,
				targetHandle: e.targetHandle ?? undefined,
				data: e.data as FlowEdge['data'],
			})),
		};
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		if (loading || !ready) return;
		flowNodes = fromCanvas().nodes;
		flowEdges = fromCanvas().edges;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
	}

	async function save() {
		saveStatus = 'Saving…';
		try {
			const graph = fromCanvas();
			const res = await api<{ graph: FlowGraph }>(`/api/projects/${slug}/flow`, {
				method: 'PUT',
				body: JSON.stringify({ graph }),
			});
			flowNodes = res.graph.nodes;
			flowEdges = res.graph.edges;
			saveStatus = 'Saved';
			setTimeout(() => {
				if (saveStatus === 'Saved') saveStatus = '';
			}, 1500);
		} catch (e) {
			saveStatus = (e as Error).message;
		}
	}

	async function loadDialogs() {
		const res = await api<{ dialogs: DialogListItem[] }>(`/api/projects/${slug}/dialogs`);
		dialogs = res.dialogs;
	}

	async function load() {
		loading = true;
		ready = false;
		loadError = '';
		try {
			const [{ graph }] = await Promise.all([
				api<{ graph: FlowGraph }>(`/api/projects/${slug}/flow`),
				loadDialogs(),
			]);
			flowNodes = graph.nodes;
			flowEdges = graph.edges;
			toCanvas(graph);
			ready = true;
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function setCanvasNodes(nodes: CanvasNode[]) {
		canvasNodes = nodes;
		scheduleSave();
	}

	function setCanvasEdges(edges: CanvasEdge[]) {
		canvasEdges = edges;
		scheduleSave();
	}

	function selectNode(id: string) {
		selectedNodeId = id;
	}

	function updateNode(updated: FlowNode) {
		canvasNodes = canvasNodes.map((n) =>
			n.id === updated.id
				? { ...n, data: updated.data, type: updated.type }
				: n,
		);
		flowNodes = flowNodes.map((n) => (n.id === updated.id ? updated : n));
		syncKey = `local-${Date.now()}`;
		scheduleSave();
	}

	function onConnect(connection: {
		source: string | null;
		target: string | null;
		sourceHandle?: string | null;
		targetHandle?: string | null;
	}) {
		if (!connection.source || !connection.target) return;
		const id = `e-${connection.source}-${connection.target}-${nanoid(4)}`;
		canvasEdges = [
			...canvasEdges,
			{
				id,
				source: connection.source,
				target: connection.target,
				sourceHandle: connection.sourceHandle,
				targetHandle: connection.targetHandle,
			},
		];
		scheduleSave();
	}

	function addSceneNode() {
		const node = createSceneNode({ x: 280 + canvasNodes.length * 20, y: 180 });
		canvasNodes = [...canvasNodes, node];
		selectedNodeId = node.id;
		scheduleSave();
	}

	function addBranchNode() {
		const node = createBranchNode({ x: 280 + canvasNodes.length * 20, y: 180 });
		canvasNodes = [...canvasNodes, node];
		selectedNodeId = node.id;
		scheduleSave();
	}

	function deleteSelected() {
		if (!selectedNodeId) return;
		const node = flowNodes.find((n) => n.id === selectedNodeId);
		if (!node || node.type === 'start') return;
		if (!confirm(`Delete "${node.data.label ?? node.id}" from the flow chart?`)) return;
		canvasNodes = canvasNodes.filter((n) => n.id !== selectedNodeId);
		canvasEdges = canvasEdges.filter(
			(e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
		);
		selectedNodeId = null;
		scheduleSave();
	}

	onMount(load);
</script>

<div class="flow-editor">
	<div class="toolbar">
		<button type="button" class="btn btn-primary" onclick={addSceneNode} disabled={!ready}>
			Add scene
		</button>
		<button type="button" class="btn" onclick={addBranchNode} disabled={!ready}>Add branch</button>
		<button
			type="button"
			class="btn btn-danger"
			onclick={deleteSelected}
			disabled={!selectedNodeId || selectedNode?.type === 'start'}
		>
			Delete node
		</button>
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus || (loading ? 'Loading…' : '')}</span>
	</div>

	{#if loadError}
		<p class="error-banner">{loadError}</p>
	{:else if ready}
		<div class="editor-layout flow-layout">
			<div class="editor-canvas">
				<GameFlowCanvas
					nodes={canvasNodes}
					edges={canvasEdges}
					{syncKey}
					setNodes={setCanvasNodes}
					setEdges={setCanvasEdges}
					onNodeSelect={selectNode}
					{onConnect}
					onDragStop={scheduleSave}
				/>
			</div>
			<aside class="editor-inspector">
				<FlowNodeInspector
					{slug}
					node={selectedNode}
					{dialogs}
					onchange={updateNode}
					onDialogsRefresh={loadDialogs}
				/>
			</aside>
		</div>
	{/if}
</div>

<style>
	.flow-editor {
		margin: 0 -1.5rem;
		width: calc(100% + 3rem);
	}

	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 1.5rem 0.75rem;
	}

	.flow-layout {
		height: max(32rem, calc(100dvh - 14rem));
	}

	.status {
		margin-left: auto;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.status.saved {
		color: var(--success);
	}

	.error-banner {
		padding: 1rem;
		margin: 0 1.5rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
	}
</style>
