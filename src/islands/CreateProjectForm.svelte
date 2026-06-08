<script lang="ts">
import { api } from '../lib/api';

let slug = $state('');
let displayName = $state('');
let description = $state('');
let error = $state('');
let loading = $state(false);

async function create() {
	error = '';
	loading = true;
	try {
		const { project } = await api<{ project: { slug: string } }>('/api/projects', {
			method: 'POST',
			body: JSON.stringify({ slug, displayName, description }),
		});
		localStorage.setItem('dialogsys:lastProject', project.slug);
		window.location.href = `/projects/${project.slug}/characters`;
	} catch (e) {
		error = (e as Error).message;
	} finally {
		loading = false;
	}
}
</script>

<form
	class="create-form"
	onsubmit={(e) => {
		e.preventDefault();
		create();
	}}
>
	<div class="field">
		<label for="slug">Slug (lowercase, underscores)</label>
		<input id="slug" bind:value={slug} placeholder="my_game" required pattern="[a-z0-9][a-z0-9_-]*" />
	</div>
	<div class="field">
		<label for="displayName">Display name</label>
		<input id="displayName" bind:value={displayName} required />
	</div>
	<div class="field">
		<label for="description">Description</label>
		<textarea id="description" bind:value={description} rows="2"></textarea>
	</div>
	{#if error}
		<p class="error">{error}</p>
	{/if}
	<button type="submit" class="btn btn-primary" disabled={loading}>
		{loading ? 'Creating…' : 'Create project'}
	</button>
</form>

<style>
	.create-form {
		max-width: 420px;
		margin-top: 1rem;
		padding: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.error {
		color: var(--error);
		font-size: 0.9rem;
	}
</style>
