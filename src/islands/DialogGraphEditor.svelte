<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import type { Character, CharactersFile } from '../lib/schema/characters';
	import type { DialogGraph, GraphNode, GraphEdge } from '../lib/schema/graph';
	import {
		insertNodeAfter,
		insertNodeBefore,
		moveNodeBefore,
		removeChoiceOption,
		setBranchTarget,
		unlinkNode,
	} from '../lib/graph/graphEdit';
	import { createBlankNode } from '../lib/graph/nodeFactory';
	import { findEntryNode, singleNextTarget } from '../lib/graph/graphUtils';
	import { getBlockMemberIds, getSiblingIds } from '../lib/graph/pathTree';
	import DialogTreeView from './DialogTreeView.svelte';
	import NodeInspector from './NodeInspector.svelte';

	interface Props {
		slug: string;
		dialogId: string;
	}

	let { slug, dialogId }: Props = $props();

	let loading = $state(true);
	let ready = $state(false);

	let graphMeta = $state({ displayName: '', description: '' });
	let selectedNodeId = $state<string | null>(null);
	let saveStatus = $state('');
	let loadError = $state('');
	let characters = $state<Character[]>([]);
	let dialogIds = $state<string[]>([]);

	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);
	let activeBranches = $state<Record<string, string>>({});
	let expandedIds = $state(new Set<string>());
	let openMenuId = $state<string | null>(null);
	let dragNodeId = $state<string | null>(null);

	const selectedNode = $derived(
		selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null,
	);

	function toGraph(): DialogGraph {
		return {
			id: dialogId,
			displayName: graphMeta.displayName,
			description: graphMeta.description,
			nodes,
			edges,
		};
	}

	function loadGraph(graph: DialogGraph) {
		if (!Array.isArray(graph.nodes)) throw new Error('Dialog has no nodes array');
		if (!Array.isArray(graph.edges)) throw new Error('Dialog has no edges array');
		nodes = graph.nodes;
		edges = graph.edges;
		expandedIds = new Set(graph.nodes.map((n) => n.id));
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
			await api(`/api/projects/${slug}/dialogs/${dialogId}`, {
				method: 'PUT',
				body: JSON.stringify({ graph: toGraph() }),
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
			loadGraph(graph);
			characters = Array.isArray(chars.characters) ? chars.characters : [];
			dialogIds = dialogs.dialogs.map((d) => d.id);
			ready = true;

			const hash = window.location.hash.replace(/^#/, '');
			if (hash) selectedNodeId = hash;
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function insertBlank(relativeId: string, position: 'before' | 'after') {
		const relative = nodes.find((n) => n.id === relativeId);
		if (!relative || relative.type === 'entry') return;

		const blank = createBlankNode();
		let sourceHandle: string | undefined;

		if (position === 'after') {
			if (relative.type === 'choice') {
				sourceHandle = activeBranches[relativeId] ?? relative.data.options?.[0]?.id;
			} else if (relative.type === 'condition') {
				sourceHandle = activeBranches[relativeId] ?? 'true';
			}
			const result = insertNodeAfter(nodes, edges, relativeId, blank, sourceHandle);
			nodes = result.nodes;
			edges = result.edges;
		} else {
			const result = insertNodeBefore(nodes, edges, relativeId, blank);
			nodes = result.nodes;
			edges = result.edges;
		}

		expandedIds = new Set([...expandedIds, blank.id]);
		selectedNodeId = blank.id;
		scheduleSave();
	}

	function updateNode(updated: GraphNode) {
		nodes = nodes.map((n) => (n.id === updated.id ? updated : n));
		scheduleSave();
	}

	function updateEdge(updated: GraphEdge) {
		edges = edges.map((e) => (e.id === updated.id ? updated : e));
		scheduleSave();
	}

	function handleSetBranchTarget(sourceId: string, handle: string, targetId: string) {
		if (!targetId) return;
		edges = setBranchTarget(edges, sourceId, handle, targetId);
		scheduleSave();
	}

	function handleRemoveChoiceOption(optionId: string) {
		if (!selectedNode || selectedNode.type !== 'choice') return;
		const nodeId = selectedNode.id;
		const result = removeChoiceOption(nodes, edges, nodeId, optionId);
		if (!result) return;
		nodes = result.nodes;
		edges = result.edges;
		if (activeBranches[nodeId] === optionId) {
			const nextId = result.nodes.find((n) => n.id === nodeId)?.data.options?.[0]?.id;
			if (nextId) {
				activeBranches = { ...activeBranches, [nodeId]: nextId };
			} else {
				const { [nodeId]: _, ...rest } = activeBranches;
				activeBranches = rest;
			}
		}
		scheduleSave();
	}

	function handleBranchChange(nodeId: string, branchId: string) {
		activeBranches = { ...activeBranches, [nodeId]: branchId };
		expandedIds = new Set([...expandedIds, nodeId]);
	}

	function toggleExpanded(id: string) {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	function selectNode(id: string) {
		selectedNodeId = id;
		openMenuId = null;
		window.location.hash = id;
	}

	function deleteNode(id: string) {
		const node = nodes.find((n) => n.id === id);
		if (!node || node.type === 'entry') return;
		if (!confirm(`Delete this step?`)) return;
		const result = unlinkNode(nodes, edges, id);
		nodes = result.nodes;
		edges = result.edges;
		if (selectedNodeId === id) selectedNodeId = null;
		scheduleSave();
	}

	function handleDropBefore(dragId: string, beforeId: string) {
		if (dragId === beforeId) return;
		const siblings = getSiblingIds(nodes, edges, activeBranches, dragId);
		if (!siblings.includes(beforeId)) return;
		const block = getBlockMemberIds(nodes, edges, activeBranches, dragId);
		if (block.includes(beforeId)) return;

		const result = moveNodeBefore(nodes, edges, dragId, beforeId, activeBranches);
		nodes = result.nodes;
		edges = result.edges;
		scheduleSave();
	}

	/** If tree has only entry→end, add a blank step after entry on first edit. */
	function ensureFirstStep() {
		const entry = findEntryNode(nodes);
		if (!entry) return;
		const next = singleNextTarget(edges, entry.id);
		const nextNode = nodes.find((n) => n.id === next);
		if (nextNode?.type === 'end') {
			const blank = createBlankNode();
			const result = insertNodeBefore(nodes, edges, next, blank);
			nodes = result.nodes;
			edges = result.edges;
			selectedNodeId = blank.id;
			scheduleSave();
		}
	}

	onMount(async () => {
		await load();
		ensureFirstStep();
	});
</script>

<div class="editor-shell">
	<div class="editor-meta">
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus || (loading ? 'Loading…' : '')}</span>
	</div>

	{#if loadError}
		<p class="error-banner">{loadError}</p>
	{:else if ready}
		<div class="editor-layout">
			<div class="editor-canvas">
				<DialogTreeView
					{nodes}
					{edges}
					{characters}
					{dialogIds}
					{selectedNodeId}
					{activeBranches}
					{expandedIds}
					{openMenuId}
					{dragNodeId}
					onSelect={selectNode}
					onBranchChange={handleBranchChange}
					onToggle={toggleExpanded}
					onInsertBefore={(id) => insertBlank(id, 'before')}
					onInsertAfter={(id) => insertBlank(id, 'after')}
					onDelete={deleteNode}
					onMenuToggle={(id) => (openMenuId = id)}
					onDragStart={(id) => (dragNodeId = id)}
					onDragEnd={() => (dragNodeId = null)}
					onDropBefore={handleDropBefore}
					onNodeChange={updateNode}
					onEdgeChange={updateEdge}
					onSetBranchTarget={handleSetBranchTarget}
				/>
			</div>
			<aside class="editor-inspector">
				<NodeInspector
					node={selectedNode}
					{nodes}
					{edges}
					{characters}
					{dialogIds}
					onchange={updateNode}
					onedgechange={updateEdge}
					onSetBranchTarget={handleSetBranchTarget}
					onRemoveChoiceOption={handleRemoveChoiceOption}
				/>
			</aside>
		</div>
	{/if}
</div>

<style>
	.editor-shell {
		margin: 0 -1.5rem;
		width: calc(100% + 3rem);
	}

	.editor-meta {
		display: flex;
		justify-content: flex-end;
		padding: 0 1.5rem 0.5rem;
		min-height: 1.25rem;
	}

	.status {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.status.saved {
		color: var(--success);
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
