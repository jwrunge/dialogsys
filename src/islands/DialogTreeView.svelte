<script lang="ts">
	import type { Character } from '../lib/schema/characters';
	import type { GraphEdge, GraphNode } from '../lib/schema/graph';
	import { buildMainPathTree, flattenActivePath, getSiblingIds } from '../lib/graph/pathTree';
	import DialogTreeItem from './DialogTreeItem.svelte';

	interface Props {
		nodes: GraphNode[];
		edges: GraphEdge[];
		characters: Character[];
		dialogIds: string[];
		selectedNodeId: string | null;
		activeBranches: Record<string, string>;
		expandedIds: Set<string>;
		openMenuId: string | null;
		dragNodeId: string | null;
		onSelect: (id: string) => void;
		onBranchChange: (nodeId: string, branchId: string) => void;
		onToggle: (id: string) => void;
		onInsertBefore: (id: string) => void;
		onInsertAfter: (id: string) => void;
		onDelete: (id: string) => void;
		onMenuToggle: (id: string | null) => void;
		onDragStart: (id: string) => void;
		onDragEnd: () => void;
		onDropBefore: (dragId: string, beforeId: string) => void;
		onNodeChange: (node: GraphNode) => void;
		onEdgeChange: (edge: GraphEdge) => void;
		onSetBranchTarget: (sourceId: string, handle: string, targetId: string) => void;
	}

	let {
		nodes,
		edges,
		characters,
		dialogIds,
		selectedNodeId,
		activeBranches,
		expandedIds,
		openMenuId,
		dragNodeId,
		onSelect,
		onBranchChange,
		onToggle,
		onInsertBefore,
		onInsertAfter,
		onDelete,
		onMenuToggle,
		onDragStart,
		onDragEnd,
		onDropBefore,
		onNodeChange,
		onEdgeChange,
		onSetBranchTarget,
	}: Props = $props();

	const mainTree = $derived(buildMainPathTree(nodes, edges, activeBranches));
	const pathOrder = $derived(flattenActivePath(nodes, edges, activeBranches));
	const canDrag = $derived(pathOrder.length > 1);
	const dragSiblings = $derived(
		dragNodeId ? getSiblingIds(nodes, edges, activeBranches, dragNodeId) : [],
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="tree-view" onclick={() => openMenuId && onMenuToggle(null)}>
	{#if mainTree}
		<DialogTreeItem
			item={mainTree}
			{nodes}
			{edges}
			{characters}
			{dialogIds}
			{expandedIds}
			{selectedNodeId}
			{activeBranches}
			{openMenuId}
			{dragNodeId}
			{dragSiblings}
			{canDrag}
			{onToggle}
			{onSelect}
			{onBranchChange}
			{onInsertBefore}
			{onInsertAfter}
			{onDelete}
			{onMenuToggle}
			{onDragStart}
			{onDragEnd}
			{onDropBefore}
			{onNodeChange}
			{onEdgeChange}
			{onSetBranchTarget}
		/>
	{:else}
		<p class="muted">No entry node.</p>
	{/if}
</div>

<style>
	.tree-view {
		padding: 1rem;
		overflow-y: auto;
		height: 100%;
		min-height: 0;
	}

	.muted {
		color: var(--text-muted);
	}
</style>
