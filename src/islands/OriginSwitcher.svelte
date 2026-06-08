<script lang="ts">
import { onMount } from 'svelte';
import { api } from '../lib/api';
import type { OriginMeta } from '../lib/schema/origin';

type OriginsResponse = {
	origins: OriginMeta[];
	clientId: string;
	activeOriginId: string;
};

let { slug }: { slug: string } = $props();

let origins = $state<OriginMeta[]>([]);
let clientId = $state('');
let activeOriginId = $state('');
let ready = $state(false);
let switching = $state(false);
let error = $state('');
let hidden = $state(true);

async function load() {
	try {
		const res = await api<OriginsResponse>(`/api/projects/${slug}/origins`);
		origins = res.origins;
		clientId = res.clientId;
		activeOriginId = res.activeOriginId;
		hidden = false;
		ready = true;
	} catch (e) {
		hidden = true;
		error = (e as Error).message;
	}
}

async function switchTo(originId: string) {
	if (originId === activeOriginId || switching) return;
	switching = true;
	error = '';
	try {
		await api(`/api/projects/${slug}/origins`, {
			method: 'POST',
			body: JSON.stringify({ originId }),
		});
		window.location.reload();
	} catch (e) {
		error = (e as Error).message;
		switching = false;
	}
}

function labelFor(origin: OriginMeta): string {
	if (origin.label) return origin.label;
	if (origin.isSelf) return 'This device';
	return `${origin.originId.slice(0, 8)}…`;
}

onMount(load);
</script>

{#if !hidden}
	<div class="origin-switcher" data-transmut="include">
		<span class="label">Working thread</span>
		<div class="origin-list">
			{#each origins as origin (origin.originId)}
				<button
					type="button"
					class:active={origin.originId === activeOriginId}
					disabled={switching}
					onclick={() => switchTo(origin.originId)}
				>
					<span class="name" data-transmut-skip>{labelFor(origin)}</span>
					<span class="meta" data-transmut-skip>{new Date(origin.updatedAt).toLocaleString()}</span>
				</button>
			{/each}
		</div>
		<p class="hint">
			Each device keeps its own latest version on the sync server. Switch threads to continue from
			another device&apos;s saved state.
		</p>
		{#if error}
			<p class="error" data-transmut-skip>{error}</p>
		{/if}
	</div>
{/if}

<style>
	.origin-switcher {
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.label {
		display: block;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
	}

	.origin-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.origin-list button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
		font: inherit;
	}

	.origin-list button.active {
		border-color: var(--accent-dim);
		background: var(--bg-hover);
	}

	.origin-list button:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.name {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.meta {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.hint {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.error {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--error);
	}
</style>
