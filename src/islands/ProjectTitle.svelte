<script lang="ts">
import { tick } from 'svelte';
import { api } from '../lib/api';
import type { ProjectMeta } from '../lib/schema/project';

interface Props {
	slug: string;
	displayName: string;
	description?: string;
}

let { slug, displayName: initialName, description: initialDescription = '' }: Props = $props();

let displayName = $state(initialName);
let description = $state(initialDescription);
let dialogEl = $state<HTMLDialogElement | null>(null);
let draftName = $state('');
let draftDescription = $state('');
let error = $state('');
let saving = $state(false);

async function openModal() {
	draftName = displayName;
	draftDescription = description;
	error = '';
	await tick();
	dialogEl?.showModal();
}

function closeModal() {
	dialogEl?.close();
	error = '';
}

async function submit(e: Event) {
	e.preventDefault();
	if (saving) return;
	error = '';
	saving = true;
	const name = draftName.trim();
	const desc = draftDescription.trim();
	try {
		const res = await api<{ project: ProjectMeta }>(`/api/projects/${slug}`, {
			method: 'PATCH',
			body: JSON.stringify({ displayName: name, description: desc }),
		});
		displayName = res.project.displayName;
		description = res.project.description;
		closeModal();
	} catch (err) {
		error = (err as Error).message;
	} finally {
		saving = false;
	}
}
</script>

<div class="title-row">
	<h1>{displayName}</h1>
	<button type="button" class="icon-btn" aria-label="Edit project" onclick={openModal}>
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

<dialog bind:this={dialogEl} class="modal" onclose={closeModal}>
	<form class="modal-panel" onsubmit={submit}>
		<header class="modal-header">
			<h2>Edit project</h2>
		</header>
		<div class="modal-body">
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<div class="field">
				<label for="project-display-name">Display name</label>
				<input id="project-display-name" bind:value={draftName} required autocomplete="off" />
			</div>
			<div class="field">
				<label for="project-description">Description</label>
				<textarea id="project-description" bind:value={draftDescription} rows="3"></textarea>
			</div>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeModal} disabled={saving}>Cancel</button>
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? 'Saving…' : 'Done'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-size: 1.35rem;
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
