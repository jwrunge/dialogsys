<script lang="ts">
	import { tick } from 'svelte';
	import { api } from '../lib/api';
	import type { DialogGraph } from '../lib/schema/graph';

	interface Props {
		slug: string;
		dialogId: string;
		displayName: string;
		description?: string;
		nodeCount?: number;
		sequenceCount?: number;
	}

	let {
		slug,
		dialogId,
		displayName: initialName,
		description: initialDescription = '',
		nodeCount: initialNodeCount = 0,
		sequenceCount: initialSequenceCount = 0,
	}: Props = $props();

	let displayName = $state(initialName);
	let description = $state(initialDescription);
	let editDialogEl = $state<HTMLDialogElement | null>(null);
	let deleteDialogEl = $state<HTMLDialogElement | null>(null);
	let draftName = $state('');
	let draftDescription = $state('');
	let error = $state('');
	let saving = $state(false);
	let deleting = $state(false);
	let usageNodeCount = $state(initialNodeCount);
	let usageSequenceCount = $state(initialSequenceCount);
	let deleteMessage = $state('Are you sure?');

	const usageLabel = $derived.by(() => {
		if (usageNodeCount === 0 && usageSequenceCount === 0) return null;
		const seq = `${usageSequenceCount} sequence${usageSequenceCount === 1 ? '' : 's'}`;
		const nodes = `${usageNodeCount} node${usageNodeCount === 1 ? '' : 's'}`;
		return `Used in ${seq} · ${nodes}`;
	});

	function getReturnPath(): string {
		const scenesPath = `/projects/${slug}/scenes`;
		const sequencesPath = `/projects/${slug}/sequences`;

		const params = new URLSearchParams(window.location.search);
		const from = params.get('from');
		const fromSequence = params.get('sequence');
		if (from === 'sequence') {
			return fromSequence
				? `/projects/${slug}/sequences/${fromSequence}`
				: sequencesPath;
		}

		try {
			const ref = new URL(document.referrer);
			if (ref.pathname.startsWith(`/projects/${slug}/sequences`)) return ref.pathname;
		} catch {
			/* ignore invalid referrer */
		}

		return scenesPath;
	}

	async function openEditModal() {
		draftName = displayName;
		draftDescription = description;
		error = '';
		await tick();
		editDialogEl?.showModal();
	}

	function closeEditModal() {
		editDialogEl?.close();
		error = '';
	}

	async function submitEdit(e: Event) {
		e.preventDefault();
		if (saving) return;
		error = '';
		saving = true;
		const name = draftName.trim();
		const desc = draftDescription.trim();
		try {
			const res = await api<{ graph: DialogGraph }>(`/api/projects/${slug}/dialogs/${dialogId}`, {
				method: 'PATCH',
				body: JSON.stringify({ displayName: name, description: desc }),
			});
			displayName = res.graph.displayName;
			description = res.graph.description;
			window.dispatchEvent(
				new CustomEvent('scene-meta-updated', {
					detail: { displayName, description },
				}),
			);
			closeEditModal();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	async function openDeleteModal() {
		error = '';
		try {
			const res = await api<{ dialogs: { id: string; nodeCount: number; sequenceCount: number }[] }>(
				`/api/projects/${slug}/dialogs`,
			);
			const item = res.dialogs.find((d) => d.id === dialogId);
			usageNodeCount = item?.nodeCount ?? usageNodeCount;
			usageSequenceCount = item?.sequenceCount ?? usageSequenceCount;
		} catch {
			/* keep existing counts */
		}
		deleteMessage =
			usageNodeCount > 0
				? `This scene is used in ${usageSequenceCount} sequence${usageSequenceCount === 1 ? '' : 's'} (${usageNodeCount} node${usageNodeCount === 1 ? '' : 's'}). Are you sure you want to delete it?`
				: 'Are you sure?';
		await tick();
		deleteDialogEl?.showModal();
	}

	function closeDeleteModal() {
		deleteDialogEl?.close();
		error = '';
	}

	async function confirmDelete(e: Event) {
		e.preventDefault();
		if (deleting) return;
		error = '';
		deleting = true;
		try {
			await api(`/api/projects/${slug}/dialogs/${dialogId}`, { method: 'DELETE' });
			window.location.assign(getReturnPath());
		} catch (err) {
			error = (err as Error).message;
			deleting = false;
		}
	}
</script>

<div class="scene-header">
	<div class="title-block">
		<div class="title-row">
			<h2>{displayName}</h2>
			<button type="button" class="icon-btn" aria-label="Edit scene" onclick={openEditModal}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M13.5 6.5l3 3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
		{#if usageLabel}
			<p class="usage-meta">{usageLabel}</p>
		{/if}
	</div>
	<button type="button" class="btn btn-danger" onclick={openDeleteModal}>Delete</button>
</div>

<dialog bind:this={editDialogEl} class="modal" onclose={closeEditModal}>
	<form class="modal-panel" onsubmit={submitEdit}>
		<header class="modal-header">
			<h2>Edit scene</h2>
		</header>
		<div class="modal-body">
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<div class="field">
				<label for="scene-display-name">Display name</label>
				<input id="scene-display-name" bind:value={draftName} required autocomplete="off" />
			</div>
			<div class="field">
				<label for="scene-description">Description</label>
				<textarea id="scene-description" bind:value={draftDescription} rows="3"></textarea>
			</div>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeEditModal} disabled={saving}>Cancel</button>
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? 'Saving…' : 'Done'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<dialog bind:this={deleteDialogEl} class="modal" onclose={closeDeleteModal}>
	<form
		class="modal-panel modal-panel-sm"
		onsubmit={confirmDelete}
	>
		<header class="modal-header">
			<h2>Delete scene</h2>
		</header>
		<div class="modal-body">
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<p>{deleteMessage}</p>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeDeleteModal} disabled={deleting}>
					Cancel
				</button>
				<button type="submit" class="btn btn-danger" disabled={deleting}>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	.scene-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.title-block {
		min-width: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}

	.usage-meta {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		color: var(--text);
		border-color: var(--accent-dim);
		background: var(--bg-hover);
	}

	.error {
		color: var(--error);
		margin: 0 0 0.75rem;
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
		font-weight: 600;
	}

	.modal-body {
		padding: 1.25rem;
	}

	.modal-body p {
		margin: 0;
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
