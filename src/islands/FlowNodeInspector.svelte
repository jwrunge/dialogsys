<script lang="ts">
	import { tick } from 'svelte';
	import Fuse from 'fuse.js';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type { DialogListItem } from '../lib/server/projects';
	import type { FlowBranchOption, FlowNode, FlowNodeData } from '../lib/schema/flow';

	interface Props {
		slug: string;
		node: FlowNode | null;
		dialogs: DialogListItem[];
		onchange: (node: FlowNode) => void;
		onTypeChange: (type: 'scene' | 'branch') => void;
		ondelete: () => void;
		onDialogsRefresh: () => Promise<void>;
	}

	let { slug, node, dialogs, onchange, onTypeChange, ondelete, onDialogsRefresh }: Props =
		$props();

	let searchQuery = $state('');
	let createDialogEl = $state<HTMLDialogElement | null>(null);
	let draftId = $state('');
	let draftName = $state('');
	let modalError = $state('');
	let creating = $state(false);

	const listedDialogs = $derived.by(() => {
		const q = searchQuery.trim();
		if (!q) return dialogs;
		const fuse = new Fuse(dialogs, {
			keys: [
				{ name: 'displayName', weight: 0.5 },
				{ name: 'id', weight: 0.35 },
				{ name: 'description', weight: 0.15 },
			],
			threshold: 0.4,
			ignoreLocation: true,
		});
		return fuse.search(q).map((r) => r.item);
	});

	function updateData(patch: Partial<FlowNodeData>) {
		if (!node) return;
		onchange({ ...node, data: { ...node.data, ...patch } });
	}

	function slugifyLabel(label: string): string {
		return (
			label
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_|_$/g, '')
				.slice(0, 32) || 'scene'
		);
	}

	async function openCreateModal() {
		if (!node || node.type !== 'scene') return;
		draftName = node.data.label?.trim() || 'New scene';
		draftId = slugifyLabel(draftName);
		modalError = '';
		await tick();
		createDialogEl?.showModal();
	}

	function closeCreateModal() {
		createDialogEl?.close();
		modalError = '';
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		if (!node || creating) return;
		modalError = '';
		creating = true;
		const id = draftId.trim();
		const displayName = draftName.trim();
		try {
			await api(`/api/projects/${slug}/dialogs`, {
				method: 'POST',
				body: JSON.stringify({ id, displayName }),
			});
			await onDialogsRefresh();
			updateData({ dialogId: id, label: displayName });
			closeCreateModal();
		} catch (err) {
			modalError = (err as Error).message;
		} finally {
			creating = false;
		}
	}

	function addBranchOption() {
		if (!node || node.type !== 'branch') return;
		const options: FlowBranchOption[] = [
			...(node.data.options ?? []),
			{ id: nanoid(6), label: 'New path' },
		];
		updateData({ options });
	}

	function removeBranchOption(optionId: string) {
		if (!node || node.type !== 'branch') return;
		const options = node.data.options ?? [];
		if (options.length <= 1) return;
		updateData({ options: options.filter((o) => o.id !== optionId) });
	}
</script>

{#if !node}
	<p class="muted">Click a node to assign a scene or edit its label.</p>
{:else}
	<h3>{node.type} <code>{node.id}</code></h3>

	{#if node.type === 'scene' || node.type === 'branch'}
		<div class="type-toggle" role="group" aria-label="Node type">
			<button
				type="button"
				class:active={node.type === 'scene'}
				onclick={() => onTypeChange('scene')}
			>
				Scene
			</button>
			<button
				type="button"
				class:active={node.type === 'branch'}
				onclick={() => onTypeChange('branch')}
			>
				Branch
			</button>
		</div>
	{/if}

	<div class="field">
		<label for="flow-label">Label</label>
		<input
			id="flow-label"
			value={node.data.label ?? ''}
			oninput={(e) => updateData({ label: (e.currentTarget as HTMLInputElement).value })}
		/>
	</div>

	{#if node.type === 'scene'}
		<div class="field">
			<label for="flow-dialog-search">Assign dialog</label>
			<input
				id="flow-dialog-search"
				class="search"
				type="search"
				bind:value={searchQuery}
				placeholder="Search scenes…"
			/>
		</div>

		<div class="dialog-pick-list">
			<button
				type="button"
				class="pick-item"
				class:selected={!node.data.dialogId}
				onclick={() => updateData({ dialogId: undefined })}
			>
				<span class="pick-name">— None —</span>
			</button>
			{#each listedDialogs as d (d.id)}
				<button
					type="button"
					class="pick-item"
					class:selected={node.data.dialogId === d.id}
					onclick={() =>
						updateData({
							dialogId: d.id,
							label: node!.data.label?.trim() ? node!.data.label : d.displayName,
						})}
				>
					<span class="pick-name">{d.displayName}</span>
					<span class="pick-id">{d.id}</span>
				</button>
			{/each}
		</div>

		<div class="actions">
			<button type="button" class="btn" onclick={openCreateModal}>Create new scene…</button>
			{#if node.data.dialogId}
				<a class="btn" href={`/projects/${slug}/dialogs/${node.data.dialogId}`}>Edit dialog</a>
			{/if}
		</div>
	{:else if node.type === 'branch'}
		<p class="hint">Connect each path handle to the next scene or branch.</p>
		{#each node.data.options ?? [] as opt, i (opt.id)}
			<div class="option-row">
				<div class="field">
					<label>Path {i + 1}</label>
					<input
						value={opt.label}
						oninput={(e) => {
							const options = [...(node!.data.options ?? [])];
							options[i] = { ...opt, label: (e.currentTarget as HTMLInputElement).value };
							updateData({ options });
						}}
					/>
				</div>
				<button
					type="button"
					class="btn btn-danger btn-sm"
					disabled={(node.data.options?.length ?? 0) <= 1}
					onclick={() => removeBranchOption(opt.id)}
				>
					Remove
				</button>
			</div>
		{/each}
		<button type="button" class="btn" onclick={addBranchOption}>Add path</button>
	{:else if node.type === 'start'}
		<p class="hint">Connect from here to your first scene. Only one game start node.</p>
	{:else if node.type === 'end'}
		<p class="hint">Terminal node — connect scenes and branches here when the game ends.</p>
		<div class="field">
			<label for="flow-notes">Notes</label>
			<textarea
				id="flow-notes"
				value={node.data.notes ?? ''}
				oninput={(e) => updateData({ notes: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="3"
			></textarea>
		</div>
	{/if}

	{#if node.type !== 'start'}
		<div class="inspector-actions">
			<button type="button" class="btn btn-danger" onclick={ondelete}>Delete node</button>
		</div>
	{/if}
{/if}

<dialog bind:this={createDialogEl} class="modal" onclose={closeCreateModal}>
	<form class="modal-panel" onsubmit={submitCreate}>
		<header class="modal-header">
			<h2>Create scene</h2>
		</header>
		<div class="modal-body">
			{#if modalError}
				<p class="error">{modalError}</p>
			{/if}
			<div class="field">
				<label for="new-scene-id">ID</label>
				<input
					id="new-scene-id"
					bind:value={draftId}
					required
					pattern="[a-z][a-z0-9_]*"
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label for="new-scene-name">Display name</label>
				<input id="new-scene-name" bind:value={draftName} required autocomplete="off" />
			</div>
			<p class="hint">The new dialog is created and assigned to this flow node automatically.</p>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeCreateModal} disabled={creating}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={creating}>
					{creating ? 'Creating…' : 'Create & assign'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	h3 {
		font-size: 0.95rem;
		margin-bottom: 1rem;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.search {
		width: 100%;
	}

	.dialog-pick-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 240px;
		overflow-y: auto;
		margin-bottom: 0.75rem;
	}

	.pick-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.pick-item:hover {
		background: var(--bg-hover);
	}

	.pick-item.selected {
		border-color: var(--accent);
		background: var(--bg-hover);
	}

	.pick-name {
		font-size: 0.9rem;
	}

	.pick-id {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.type-toggle {
		display: flex;
		gap: 0;
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.type-toggle button {
		flex: 1;
		padding: 0.45rem 0.75rem;
		border: none;
		background: var(--bg);
		color: var(--text-muted);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.type-toggle button:first-child {
		border-radius: calc(var(--radius) - 1px) 0 0 calc(var(--radius) - 1px);
	}

	.type-toggle button:last-child {
		border-radius: 0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0;
	}

	.type-toggle button + button {
		border-left: 1px solid var(--border);
	}

	.type-toggle button:hover {
		background: var(--bg-hover);
		color: var(--text);
	}

	.type-toggle button.active {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 600;
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.inspector-actions {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.option-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		margin-bottom: 0.5rem;
	}

	.option-row .field {
		flex: 1;
		margin: 0;
	}

	.btn-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.error {
		color: var(--error);
	}

	.modal {
		border: none;
		padding: 0;
		margin: auto;
		position: fixed;
		inset: 0;
		width: min(480px, calc(100vw - 2rem));
		height: fit-content;
		max-height: calc(100vh - 2rem);
		background: transparent;
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.modal-panel {
		margin: 0;
		padding: 0;
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.modal-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.modal-body {
		padding: 1.25rem;
	}

	.modal-footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	.modal-footer-right {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
