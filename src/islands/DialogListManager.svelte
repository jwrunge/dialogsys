<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let dialogs = $state<{ id: string; displayName: string }[]>([]);
	let newId = $state('');
	let newName = $state('');
	let error = $state('');

	async function load() {
		const res = await api<{ dialogs: { id: string; displayName: string }[] }>(
			`/api/projects/${slug}/dialogs`,
		);
		dialogs = res.dialogs;
	}

	async function create() {
		error = '';
		try {
			await api(`/api/projects/${slug}/dialogs`, {
				method: 'POST',
				body: JSON.stringify({ id: newId, displayName: newName || newId }),
			});
			newId = '';
			newName = '';
			await load();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function remove(id: string) {
		if (!confirm(`Delete dialog "${id}"?`)) return;
		await api(`/api/projects/${slug}/dialogs/${id}`, { method: 'DELETE' });
		await load();
	}

	onMount(load);
</script>

<div class="create-row">
	<input bind:value={newId} placeholder="dialog_id" pattern="[a-z][a-z0-9_]*" />
	<input bind:value={newName} placeholder="Display name" />
	<button type="button" class="btn btn-primary" onclick={create}>New dialog</button>
</div>
{#if error}<p class="error">{error}</p>{/if}

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

<style>
	.create-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.create-row input {
		max-width: 200px;
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
	}

	.muted {
		color: var(--text-muted);
	}
</style>
