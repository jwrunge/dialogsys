<script lang="ts">
import type { PathTreeItem } from '../lib/graph/pathTree';
import type { Character } from '../lib/schema/characters';
import type { GraphEdge, GraphNode } from '../lib/schema/graph';
import Self from './DialogTreeItem.svelte';

interface Props {
	item: PathTreeItem;
	nodes: GraphNode[];
	edges: GraphEdge[];
	characters: Character[];
	dialogIds: string[];
	expandedIds: Set<string>;
	selectedNodeId: string | null;
	activeBranches: Record<string, string>;
	openMenuId: string | null;
	dragNodeId: string | null;
	dragSiblings: string[];
	canDrag: boolean;
	onToggle: (id: string) => void;
	onSelect: (id: string) => void;
	onBranchChange: (nodeId: string, branchId: string) => void;
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
	item,
	nodes,
	edges,
	characters,
	dialogIds,
	expandedIds,
	selectedNodeId,
	activeBranches,
	openMenuId,
	dragNodeId,
	dragSiblings,
	canDrag,
	onToggle,
	onSelect,
	onBranchChange,
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

const node = $derived(nodes.find((n) => n.id === item.node.id) ?? item.node);
const expanded = $derived(expandedIds.has(node.id));
const selected = $derived(selectedNodeId === node.id);
const isEntry = $derived(node.type === 'entry');
const menuOpen = $derived(openMenuId === node.id);
const isDragging = $derived(dragNodeId === node.id);
const isDraggable = $derived(
	canDrag &&
		!isEntry &&
		!item.isMerge &&
		!['choice', 'condition', 'end', 'jump', 'blank'].includes(node.type),
);
const isDropTarget = $derived(
	dragNodeId != null &&
		dragNodeId !== node.id &&
		dragSiblings.includes(node.id) &&
		!item.isMerge &&
		!isEntry,
);
const isInDragBlock = $derived(
	dragNodeId != null &&
		item.depth > 0 &&
		dragSiblings.length > 0 &&
		!dragSiblings.includes(node.id) &&
		dragNodeId !== node.id,
);

const speakerName = $derived.by(() => {
	if (node.type !== 'line') return '';
	const char = characters.find((c) => c.id === node.data.speaker);
	return char?.displayName ?? node.data.speaker ?? '—';
});

function summary(): string {
	switch (node.type) {
		case 'blank':
			return 'Choose type…';
		case 'line':
			return node.data.text?.trim() || '(empty line)';
		case 'choice':
			return `${node.data.options?.length ?? 0} option(s)`;
		case 'condition':
			return node.data.branchVar ? `If ${node.data.branchVar}` : '(no variable)';
		case 'set_var': {
			const op = node.data.setOps?.[0];
			return op ? `Set ${op.var}` : 'Set variable';
		}
		case 'jump':
			return `→ ${node.data.targetDialogId || '?'}`;
		case 'direction':
			return node.data.directionText?.trim() || '(direction)';
		case 'end':
			return 'End of scene';
		case 'entry':
			return 'Start';
		default:
			return node.type;
	}
}

function typeLabel(): string {
	const labels: Record<string, string> = {
		blank: 'New',
		line: 'Line',
		choice: 'Choice',
		condition: 'Condition',
		set_var: 'Set var',
		jump: 'Jump',
		direction: 'Direction',
		end: 'End',
		entry: 'Start',
	};
	return labels[node.type] ?? node.type;
}

function handleRowClick() {
	onSelect(node.id);
	if (!expanded) onToggle(node.id);
}

function handleDragOver(e: DragEvent) {
	if (!isDropTarget) return;
	e.preventDefault();
}

function handleDrop(e: DragEvent) {
	e.preventDefault();
	if (item.isMerge || isEntry) {
		onDragEnd();
		return;
	}
	if (dragNodeId && dragNodeId !== node.id) {
		onDropBefore(dragNodeId, node.id);
	}
	onDragEnd();
}
</script>

<div
	class="tree-item"
	class:dragging={isDragging}
	class:in-drag-block={isInDragBlock}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<div
		class="tree-row"
		class:selected
		class:drop-target={isDropTarget}
		class:merge={item.isMerge}
		class:blank={node.type === 'blank'}
		class:direction={node.type === 'direction'}
		class:branching={node.type === 'choice' || node.type === 'condition'}
	>
		<button
			type="button"
			class="expand-btn"
			aria-label={expanded ? 'Collapse' : 'Expand'}
			aria-expanded={expanded}
			disabled={!selected && item.children.length === 0 && !item.divergence}
			onclick={() => onToggle(node.id)}
		>
			{#if item.children.length > 0 || item.divergence || selected}
				<span class="chevron" class:open={expanded || selected}>›</span>
			{:else}
				<span class="chevron spacer"></span>
			{/if}
		</button>

		{#if isDraggable}
			<button
				type="button"
				class="drag-handle"
				title="Drag to reorder"
				draggable="true"
				ondragstart={(e) => {
					e.stopPropagation();
					onDragStart(node.id);
				}}
				ondragend={onDragEnd}
			>
				⋮⋮
			</button>
		{/if}

		<button type="button" class="row-body" onclick={handleRowClick}>
			<span class="type-badge">{typeLabel()}</span>
			<span class="summary">
				{#if node.type === 'line'}
					<strong>{speakerName}:</strong>
				{/if}
				{summary()}
			</span>
			{#if item.isMerge}
				<span class="merge-tag">rejoins</span>
			{/if}
		</button>

		{#if !isEntry}
			<div class="row-actions">
				<button
					type="button"
					class="icon-btn"
					title="Insert step before"
					onclick={() => onInsertBefore(node.id)}
				>
					↑
				</button>
				<button
					type="button"
					class="icon-btn"
					title="Insert step after"
					onclick={() => onInsertAfter(node.id)}
				>
					↓
				</button>
				<div class="menu-wrap">
					<button
						type="button"
						class="icon-btn"
						title="More options"
						aria-expanded={menuOpen}
						onclick={(e) => {
							e.stopPropagation();
							onMenuToggle(menuOpen ? null : node.id);
						}}
					>
						⋯
					</button>
					{#if menuOpen}
						<div class="menu" role="menu">
							<button
								type="button"
								class="menu-item danger"
								role="menuitem"
								onclick={() => {
									onMenuToggle(null);
									onDelete(node.id);
								}}
							>
								Delete
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if expanded || selected}
		{#if item.divergence}
			<div class="branch-block">
				<div class="branch-tabs">
					{#each item.divergence.branches as branch}
						<button
							type="button"
							class="branch-tab"
							class:active={item.divergence!.activeBranchId === branch.id}
							disabled={!branch.targetId}
							onclick={() => onBranchChange(node.id, branch.id)}
						>
							{branch.label}
						</button>
					{/each}
				</div>

				{#each item.children as child}
					<Self
						item={child}
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
				{/each}
			</div>
		{:else}
			{#each item.children as child}
				<Self
					item={child}
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
			{/each}
		{/if}
	{/if}
</div>

<style>
	.tree-item.dragging .tree-row {
		opacity: 0.45;
	}

	.tree-item.in-drag-block .tree-row {
		opacity: 0.65;
	}

	.tree-row {
		display: flex;
		align-items: stretch;
		gap: 0.2rem;
	}

	.tree-row.drop-target .row-body {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent-dim);
	}

	.tree-row.selected .row-body {
		border-color: var(--accent);
		background: var(--bg-hover);
	}

	.tree-row.blank .type-badge {
		color: var(--text-muted);
	}

	.tree-row.direction .type-badge {
		color: var(--warning);
	}

	.tree-row.direction .summary {
		font-style: italic;
	}

	.expand-btn,
	.drag-handle,
	.icon-btn {
		flex-shrink: 0;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
	}

	.expand-btn {
		width: 1.5rem;
		align-self: stretch;
	}

	.drag-handle {
		width: 1.25rem;
		font-size: 0.65rem;
		letter-spacing: -0.15em;
		cursor: grab;
		align-self: center;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.chevron {
		display: inline-block;
		font-size: 1.1rem;
		transition: transform 0.15s;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.chevron.spacer {
		opacity: 0;
	}

	.row-body {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-align: left;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font: inherit;
		cursor: pointer;
		min-width: 0;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.icon-btn {
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		font-size: 0.85rem;
	}

	.icon-btn:hover {
		border-color: var(--accent-dim);
		color: var(--text);
	}

	.menu-wrap {
		position: relative;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		z-index: 20;
		min-width: 7rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 0.25rem;
	}

	.menu-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.45rem 0.65rem;
		border: none;
		border-radius: calc(var(--radius) - 2px);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.menu-item:hover {
		background: var(--bg-hover);
	}

	.menu-item.danger {
		color: var(--error);
	}

	.type-badge {
		flex-shrink: 0;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--accent);
		min-width: 4rem;
	}

	.summary {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary strong {
		color: var(--text);
	}

	.merge-tag {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.branch-block {
		margin: 0.35rem 0 0.5rem 1.25rem;
		padding-left: 1rem;
		border-left: 2px solid var(--border);
	}

	.branch-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.branch-tab {
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg);
		color: var(--text-muted);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.branch-tab.active {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: #fff;
	}

	.branch-tab:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
