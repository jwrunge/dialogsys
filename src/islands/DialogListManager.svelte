<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { api } from '../lib/api';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let dialogs = $state<{ id: string; displayName: string }[]>([]);
	let createDialogEl = $state<HTMLDialogElement | null>(null);
	let draftId = $state('');
	let draftName = $state('');
	let modalError = $state('');
	let creating = $state(false);

	async function load() {
		const res = await api<{ dialogs: { id: string; displayName: string }[] }>(
			`/api/projects/${slug}/dialogs`,
		);
		dialogs = res.dialogs;
	}

	async function openCreateModal() {
		draftId = '';
		draftName = '';
		modalError = '';
		await tick();
		createDialogEl?.showModal();
	}

	function closeCreateModal() {
		createDialogEl?.close();
		draftId = '';
		draftName = '';
		modalError = '';
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		if (creating) return;
		modalError = '';
		creating = true;
		const id = draftId.trim();
		const displayName = draftName.trim();
		try {
			await api(`/api/projects/${slug}/dialogs`, {
				method: 'POST',
				body: JSON.stringify({ id, displayName }),
			});
			createDialogEl?.close();
			window.location.assign(`/projects/${slug}/dialogs/${id}`);
		} catch (err) {
			modalError = (err as Error).message;
		} finally {
			creating = false;
		}
	}

	async function remove(id: string) {
		if (!confirm(`Delete dialog "${id}"?`)) return;
		await api(`/api/projects/${slug}/dialogs/${id}`, { method: 'DELETE' });
		await load();
	}

	onMount(load);
</script>

<div class="toolbar">
	<button type="button" class="btn btn-primary toolbar-add" onclick={openCreateModal}>
		New dialog
	</button>
</div>

<ul class="dialog-list">
	{#each dialogs as d}
		<li>
			<a href={`/projects/${slug}/dialogs/${d.id}`}>
				<strong>{d.displayName}</strong>
				<span class="id">{d.id}</span>
			</a>
			<button type="button" class="btn btn-danger" onclick={() => remove(d.id)}>Delete</button>
		</li>
	{/each}
</ul>

{#if dialogs.length === 0}
	<p class="muted">No dialogs yet.</p>
{/if}

<dialog bind:this={createDialogEl} class="modal" onclose={closeCreateModal}>
	<form class="modal-panel" onsubmit={submitCreate}>
		<header class="modal-header">
			<h2>New dialog</h2>
		</header>

		<div class="modal-body">
			{#if modalError}
				<p class="error">{modalError}</p>
			{/if}
			<div class="field">
				<label for="dialog-id">ID</label>
				<input
					id="dialog-id"
					bind:value={draftId}
					required
					pattern="[a-z][a-z0-9_]*"
					placeholder="tavern_intro"
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label for="dialog-name">Display name</label>
				<input
					id="dialog-name"
					bind:value={draftName}
					required
					placeholder="Tavern Intro"
					autocomplete="off"
				/>
			</div>
		</div>

		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeCreateModal} disabled={creating}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={creating}>
					{creating ? 'Creating…' : 'Done'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 0 1rem;
	}

	.toolbar-add {
		margin-left: auto;
	}

	.dialog-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.dialog-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.dialog-list a {
		color: inherit;
		text-decoration: none;
	}

	.dialog-list a:hover strong {
		color: var(--accent);
	}

	.id {
		display: block;
		font-size: 0.8rem;
		color: var(--text-muted);
		font-family: var(--mono);
	}

	.error {
		color: var(--error);
		margin: 0 0 1rem;
	}

	.muted {
		color: var(--text-muted);
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
		max-height: calc(100vh - 3rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		color: var(--text);
	}

	.modal-panel label {
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
		flex: 1;
		min-height: 0;
		padding: 1.25rem;
		overflow-y: auto;
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
		background: var(--bg-elevated);
	}

	.modal-footer-right {
		display: flex;
		gap: 0.5rem;
	}
</style>
