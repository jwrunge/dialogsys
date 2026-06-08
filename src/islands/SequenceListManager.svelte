<script lang="ts">
import Fuse from 'fuse.js';
import { onMount, tick } from 'svelte';
import { api } from '../lib/api';
import type { SequenceListItem } from '../lib/schema/flow';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let sequences = $state<SequenceListItem[]>([]);
let ready = $state(false);
let loadError = $state('');
let searchQuery = $state('');

let createDialogEl = $state<HTMLDialogElement | null>(null);
let draftId = $state('');
let draftName = $state('');
let modalError = $state('');
let creating = $state(false);

type ListedSequence = { sequence: SequenceListItem; index: number };

const listedSequences = $derived.by((): ListedSequence[] => {
	const q = searchQuery.trim();
	if (!q) {
		return sequences.map((sequence, index) => ({ sequence, index }));
	}
	const fuse = new Fuse(sequences, {
		keys: [
			{ name: 'displayName', weight: 0.6 },
			{ name: 'id', weight: 0.4 },
		],
		threshold: 0.4,
		ignoreLocation: true,
	});
	return fuse.search(q).map((result) => ({
		sequence: result.item,
		index: sequences.findIndex((s) => s.id === result.item.id),
	}));
});

function updatedLabel(updatedAt: string): string {
	if (!updatedAt) return 'Not saved yet';
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return 'Updated';
	return `Updated ${date.toLocaleDateString()}`;
}

async function load() {
	ready = false;
	loadError = '';
	try {
		const res = await api<{ sequences: SequenceListItem[] }>(`/api/projects/${slug}/sequences`);
		sequences = res.sequences;
		ready = true;
	} catch (e) {
		loadError = (e as Error).message;
		sequences = [];
	}
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
		await api(`/api/projects/${slug}/sequences`, {
			method: 'POST',
			body: JSON.stringify({ id, displayName }),
		});
		createDialogEl?.close();
		window.location.assign(`/projects/${slug}/sequences/${id}`);
	} catch (err) {
		modalError = (err as Error).message;
	} finally {
		creating = false;
	}
}

onMount(load);
</script>

<div class="toolbar">
	<input
		class="search"
		type="search"
		bind:value={searchQuery}
		placeholder="Search by name or id…"
		aria-label="Search sequences"
		disabled={!ready}
	/>
	<button type="button" class="btn btn-primary toolbar-add" onclick={openCreateModal} disabled={!ready}>
		Add sequence
	</button>
</div>

{#if loadError}
	<p class="error-banner">{loadError}</p>
{:else if !ready}
	<p class="muted">Loading sequences…</p>
{:else if sequences.length === 0}
	<p class="muted">No sequences yet. Click <strong>Add sequence</strong> to create one.</p>
{:else if listedSequences.length === 0}
	<p class="muted">No sequences match "{searchQuery.trim()}".</p>
{:else}
	<div class="summary-list">
		{#each listedSequences as { sequence } (sequence.id)}
			<article class="summary-card">
				<div class="sequence-icon" title="Sequence">
					<span class="sequence-icon-fallback">{sequence.displayName.charAt(0).toUpperCase()}</span>
				</div>
				<div class="summary-body">
					<div class="summary-head">
						<div>
							<h3>{sequence.displayName}</h3>
							<p class="id">{sequence.id}</p>
						</div>
						<a class="btn" href={`/projects/${slug}/sequences/${sequence.id}`}>Edit</a>
					</div>
					<p class="summary-meta">{updatedLabel(sequence.updatedAt)}</p>
				</div>
			</article>
		{/each}
	</div>
{/if}

<dialog bind:this={createDialogEl} class="modal" onclose={closeCreateModal}>
	<form class="modal-panel" onsubmit={submitCreate}>
		<header class="modal-header">
			<h2>Add sequence</h2>
		</header>

		<div class="modal-body">
			{#if modalError}
				<p class="error">{modalError}</p>
			{/if}
			<div class="field">
				<label for="sequence-id">ID</label>
				<input
					id="sequence-id"
					bind:value={draftId}
					required
					pattern="[a-z][a-z0-9_]*"
					placeholder="main_story"
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label for="sequence-name">Display name</label>
				<input
					id="sequence-name"
					bind:value={draftName}
					required
					placeholder="Main story"
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

	.toolbar .search {
		flex: 1;
		min-width: 180px;
		max-width: 420px;
	}

	.toolbar-add {
		margin-left: auto;
		flex-shrink: 0;
	}

	.summary-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.summary-card {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		padding: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.summary-body {
		flex: 1;
		min-width: 0;
	}

	.sequence-icon {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		border-radius: 10px;
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sequence-icon-fallback {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.summary-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.summary-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.id {
		margin: 0.15rem 0 0;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.summary-meta {
		margin: 0.35rem 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.error {
		color: var(--error);
		margin: 0 0 1rem;
	}

	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.error-banner {
		padding: 1rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
		margin-bottom: 1rem;
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
