<script lang="ts">
	import { onMount } from 'svelte';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type { Character, CharactersFile } from '../lib/schema/characters';
	import type { DialogGraph, GraphNode, GraphEdge } from '../lib/schema/graph';
	import NodeInspector from './NodeInspector.svelte';

	interface Props {
		slug: string;
		dialogId: string;
	}

	let { slug, dialogId }: Props = $props();

	type FlowCanvasComponent = typeof import('./DialogFlowCanvas.svelte').default;
	type FlowNode = { id: string; type?: string; position: { x: number; y: number }; data?: Record<string, unknown> };
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

	let FlowCanvas = $state<FlowCanvasComponent | null>(null);

	let loading = $state(true);
	let ready = $state(false);

	let graphMeta = $state({ displayName: '', description: '' });
	let selectedNodeId = $state<string | null>(null);
	let saveStatus = $state('');
	let loadError = $state('');
	let characters = $state<Character[]>([]);
	let dialogIds = $state<string[]>([]);
	let searchQuery = $state('');

	let nodes = $state.raw<FlowNode[]>([]);
	let edges = $state.raw<FlowEdge[]>([]);

	let selectedNode = $derived.by(() => {
		const found = nodes.find((n) => n.id === selectedNodeId);
		if (!found) return null;
		return {
			id: found.id,
			type: found.type ?? 'line',
			position: found.position,
			data: (found.data ?? {}) as GraphNode['data'],
		} as GraphNode;
	});

	const flowEdges = $derived(
		edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.sourceHandle ?? undefined,
			targetHandle: edge.targetHandle ?? undefined,
			data: (edge.data ?? {}) as GraphEdge['data'],
		})),
	);

	function flowToGraph(): DialogGraph {
		return {
			id: dialogId,
			displayName: graphMeta.displayName,
			description: graphMeta.description,
			nodes: nodes.map((node) => ({
				id: node.id,
				type: node.type ?? 'line',
				position: node.position,
				data: (node.data ?? {}) as GraphNode['data'],
			})),
			edges: edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				sourceHandle: edge.sourceHandle ?? undefined,
				targetHandle: edge.targetHandle ?? undefined,
				data: (edge.data ?? {}) as GraphEdge['data'],
			})),
		};
	}

	function graphToFlow(graph: DialogGraph) {
		if (!Array.isArray(graph.nodes)) {
			throw new Error('Dialog has no nodes array');
		}
		if (!Array.isArray(graph.edges)) {
			throw new Error('Dialog has no edges array');
		}
		nodes = graph.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: { x: n.position.x, y: n.position.y },
			data: { ...n.data, label: n.data.label ?? n.type },
		}));
		edges = graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle ?? null,
			targetHandle: e.targetHandle ?? null,
			data: e.data ?? {},
		}));
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		if (loading || !ready) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
	}

	async function save() {
		saveStatus = 'Saving…';
		try {
			const graph = flowToGraph();
			await api(`/api/projects/${slug}/dialogs/${dialogId}`, {
				method: 'PUT',
				body: JSON.stringify({ graph }),
			});
			saveStatus = 'Saved';
			setTimeout(() => {
				if (saveStatus === 'Saved') saveStatus = '';
			}, 1500);
		} catch (e) {
			saveStatus = (e as Error).message;
		}
	}

	async function load() {
		loading = true;
		ready = false;
		loadError = '';
		try {
			const [{ graph }, chars, dialogs] = await Promise.all([
				api<{ graph: DialogGraph }>(`/api/projects/${slug}/dialogs/${dialogId}`),
				api<CharactersFile>(`/api/projects/${slug}/characters`),
				api<{ dialogs: { id: string }[] }>(`/api/projects/${slug}/dialogs`),
			]);
			graphMeta = { displayName: graph.displayName, description: graph.description };
			graphToFlow(graph);
			characters = Array.isArray(chars.characters) ? chars.characters : [];
			dialogIds = dialogs.dialogs.map((d) => d.id);

			const mod = await import('./DialogFlowCanvas.svelte');
			FlowCanvas = mod.default;
			ready = true;

			const hash = window.location.hash.replace(/^#/, '');
			if (hash) selectedNodeId = hash;
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function addNode(type: string) {
		const id = `${type}_${nanoid(6)}`;
		const defaults: Record<string, Record<string, unknown>> = {
			line: {
				speaker: characters[0]?.id ?? '',
				characterState: characters[0]?.defaultStateId ?? 'default',
				text: '',
			},
			choice: {
				options: [
					{ id: nanoid(8), text: 'Option A', conditions: [] },
					{ id: nanoid(8), text: 'Option B', conditions: [] },
				],
			},
			condition: { branchScope: 'global', branchVar: '' },
			set_var: { setOps: [] },
			jump: { targetDialogId: dialogIds[0] ?? '' },
			direction: { directionText: '' },
		};
		nodes = [
			...nodes,
			{
				id,
				type,
				position: { x: 150 + nodes.length * 30, y: 100 + nodes.length * 40 },
				data: { label: type, ...(defaults[type] ?? {}) },
			},
		];
		scheduleSave();
	}

	function handleConnect(params: FlowConnection) {
		edges = [
			...edges,
			{
				id: `e-${params.source}-${params.target}-${nanoid(4)}`,
				source: params.source!,
				target: params.target!,
				sourceHandle: params.sourceHandle ?? null,
				targetHandle: params.targetHandle ?? null,
				data:
					params.sourceHandle === 'true' || params.sourceHandle === 'false'
						? { branch: params.sourceHandle }
						: {},
			},
		];
		scheduleSave();
	}

	function updateEdge(updated: GraphEdge) {
		edges = edges.map((e) =>
			e.id === updated.id ? { ...e, data: updated.data ?? {} } : e,
		);
		scheduleSave();
	}

	function updateSelectedNode(updated: GraphNode) {
		nodes = nodes.map((n) =>
			n.id === updated.id
				? {
						...n,
						data: { ...updated.data, label: updated.data.speaker || updated.type },
					}
				: n,
		);
		scheduleSave();
	}

	function focusSearch() {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return;
		const match = nodes.find(
			(n) =>
				n.id.toLowerCase().includes(q) ||
				JSON.stringify(n.data).toLowerCase().includes(q),
		);
		if (match) selectedNodeId = match.id;
	}

	onMount(load);
</script>

<div class="editor-shell">
	<div class="toolbar">
		<a href="/" class="btn">← Projects</a>
		<a href={`/projects/${slug}/dialogs`} class="btn">Dialogs</a>
		<strong>{graphMeta.displayName || dialogId}</strong>
		<button type="button" class="btn" onclick={() => addNode('line')} disabled={!ready}>+ Line</button>
		<button type="button" class="btn" onclick={() => addNode('choice')} disabled={!ready}>+ Choice</button>
		<button type="button" class="btn" onclick={() => addNode('condition')} disabled={!ready}
			>+ Condition</button
		>
		<button type="button" class="btn" onclick={() => addNode('set_var')} disabled={!ready}>+ Set var</button>
		<button type="button" class="btn" onclick={() => addNode('jump')} disabled={!ready}>+ Jump</button>
		<button type="button" class="btn" onclick={() => addNode('direction')} disabled={!ready}
			>+ Direction</button
		>
		<button type="button" class="btn btn-primary" onclick={save} disabled={!ready}>Save</button>
		<input
			class="search"
			bind:value={searchQuery}
			placeholder="Find node…"
			onkeydown={(e) => e.key === 'Enter' && focusSearch()}
		/>
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus || (loading ? 'Loading…' : '')}</span>
	</div>

	{#if loadError}
		<p class="error-banner">{loadError}</p>
	{:else if ready && FlowCanvas}
		<div class="editor-layout">
			<FlowCanvas
				{nodes}
				{edges}
				setNodes={(n) => {
					nodes = n;
				}}
				setEdges={(e) => {
					edges = e;
				}}
				onNodeSelect={(id) => (selectedNodeId = id)}
				onConnect={handleConnect}
				onDragStop={scheduleSave}
			/>
			<aside class="editor-inspector">
				<NodeInspector
					node={selectedNode}
					edges={flowEdges}
					{characters}
					{dialogIds}
					onchange={updateSelectedNode}
					onedgechange={updateEdge}
				/>
			</aside>
		</div>
	{/if}
</div>

<style>
	.editor-shell {
		margin: -1.5rem;
		width: calc(100% + 3rem);
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 320px;
		height: calc(100vh - 56px);
	}

	.search {
		max-width: 160px;
	}

	.editor-inspector {
		overflow-y: auto;
		padding: 1rem;
		background: var(--bg-elevated);
		border-left: 1px solid var(--border);
	}

	.error-banner {
		padding: 1rem;
		margin: 1rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
	}
</style>
