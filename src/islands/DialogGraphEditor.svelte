<script lang="ts">
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type { DialogGraph, GraphNode } from '../lib/schema/graph';
	import DialogNode from './DialogNode.svelte';
	import NodeInspector from './NodeInspector.svelte';

	interface Props {
		slug: string;
		dialogId: string;
	}

	let { slug, dialogId }: Props = $props();

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

	let loading = true;

	let graphMeta = $state({ displayName: '', description: '' });
	let selectedNodeId = $state<string | null>(null);
	let saveStatus = $state('');
	let characterIds = $state<string[]>([]);
	let dialogIds = $state<string[]>([]);
	let searchQuery = $state('');

	const nodes = writable<Node[]>([]);
	const edges = writable<Edge[]>([]);

	let selectedNode = $derived.by(() => {
		const list = get(nodes);
		const found = list.find((n) => n.id === selectedNodeId);
		if (!found) return null;
		return {
			id: found.id,
			type: found.type ?? 'line',
			position: found.position,
			data: (found.data ?? {}) as GraphNode['data'],
		} as GraphNode;
	});

	function flowToGraph(): DialogGraph {
		const n = get(nodes);
		const e = get(edges);
		return {
			id: dialogId,
			displayName: graphMeta.displayName,
			description: graphMeta.description,
			nodes: n.map((node) => ({
				id: node.id,
				type: node.type ?? 'line',
				position: node.position,
				data: (node.data ?? {}) as GraphNode['data'],
			})),
			edges: e.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				sourceHandle: edge.sourceHandle ?? undefined,
				targetHandle: edge.targetHandle ?? undefined,
				data: edge.data as GraphNode extends never ? never : Record<string, unknown>,
			})),
		};
	}

	function graphToFlow(graph: DialogGraph) {
		nodes.set(
			graph.nodes.map((n) => ({
				id: n.id,
				type: n.type,
				position: n.position,
				data: { ...n.data, label: n.data.label ?? n.type },
			})),
		);
		edges.set(
			graph.edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				sourceHandle: e.sourceHandle,
				targetHandle: e.targetHandle,
				data: e.data,
			})),
		);
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		if (loading) return;
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
		const [{ graph }, chars, dialogs] = await Promise.all([
			api<{ graph: DialogGraph }>(`/api/projects/${slug}/dialogs/${dialogId}`),
			api<{ characters: { id: string }[] }>(`/api/projects/${slug}/characters`),
			api<{ dialogs: { id: string }[] }>(`/api/projects/${slug}/dialogs`),
		]);
		graphMeta = { displayName: graph.displayName, description: graph.description };
		graphToFlow(graph);
		characterIds = chars.characters.map((c) => c.id);
		dialogIds = dialogs.dialogs.map((d) => d.id);
		loading = false;
	}

	function addNode(type: string) {
		const id = `${type}_${nanoid(6)}`;
		const defaults: Record<string, Record<string, unknown>> = {
			line: { speaker: characterIds[0] ?? '', text: '' },
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
		nodes.update((n) => [
			...n,
			{
				id,
				type,
				position: { x: 150 + n.length * 30, y: 100 + n.length * 40 },
				data: { label: type, ...(defaults[type] ?? {}) },
			},
		]);
		scheduleSave();
	}

	function onNodeClick({ node }: { node: Node }) {
		selectedNodeId = node.id;
	}

	function updateSelectedNode(updated: GraphNode) {
		nodes.update((list) =>
			list.map((n) =>
				n.id === updated.id
					? {
							...n,
							data: { ...updated.data, label: updated.data.speaker || updated.type },
						}
					: n,
			),
		);
		scheduleSave();
	}

	function focusSearch() {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return;
		const match = get(nodes).find(
			(n) =>
				n.id.toLowerCase().includes(q) ||
				JSON.stringify(n.data).toLowerCase().includes(q),
		);
		if (match) selectedNodeId = match.id;
	}

	onMount(() => {
		load();
		const unsubNodes = nodes.subscribe(() => scheduleSave());
		const unsubEdges = edges.subscribe(() => scheduleSave());
		return () => {
			unsubNodes();
			unsubEdges();
		};
	});
</script>

<div class="editor-shell">
	<div class="toolbar">
		<a href={`/projects/${slug}/dialogs`} class="btn">← Dialogs</a>
		<strong>{graphMeta.displayName || dialogId}</strong>
		<button type="button" class="btn" onclick={() => addNode('line')}>+ Line</button>
		<button type="button" class="btn" onclick={() => addNode('choice')}>+ Choice</button>
		<button type="button" class="btn" onclick={() => addNode('condition')}>+ Condition</button>
		<button type="button" class="btn" onclick={() => addNode('set_var')}>+ Set var</button>
		<button type="button" class="btn" onclick={() => addNode('jump')}>+ Jump</button>
		<button type="button" class="btn" onclick={() => addNode('direction')}>+ Direction</button>
		<button type="button" class="btn btn-primary" onclick={save}>Save</button>
		<input
			class="search"
			bind:value={searchQuery}
			placeholder="Find node…"
			onkeydown={(e) => e.key === 'Enter' && focusSearch()}
		/>
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus}</span>
	</div>

	<div class="editor-layout">
		<div class="editor-canvas">
			<SvelteFlow
				{nodes}
				{edges}
				{nodeTypes}
				fitView
				onnodeclick={onNodeClick}
				onconnect={(params) => {
					edges.update((e) => [
						...e,
						{
							id: `e-${params.source}-${params.target}-${nanoid(4)}`,
							source: params.source!,
							target: params.target!,
							sourceHandle: params.sourceHandle,
							targetHandle: params.targetHandle,
							data:
								params.sourceHandle === 'true' || params.sourceHandle === 'false'
									? { branch: params.sourceHandle }
									: {},
						},
					]);
				}}
			>
				<Controls />
				<Background variant={BackgroundVariant.Dots} />
				<MiniMap />
			</SvelteFlow>
		</div>
		<aside class="editor-inspector">
			<NodeInspector
				node={selectedNode}
				{characterIds}
				{dialogIds}
				onchange={updateSelectedNode}
			/>
		</aside>
	</div>
</div>

<style>
	.editor-shell {
		margin: -1.5rem;
		width: calc(100% + 3rem);
	}

	.search {
		max-width: 160px;
	}

	.editor-canvas {
		height: 100%;
		min-height: 500px;
	}

	:global(.svelte-flow) {
		background: var(--bg);
	}
</style>
