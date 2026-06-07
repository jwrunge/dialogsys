<script lang="ts">
	import { tick } from 'svelte';
	import { api } from '../lib/api';
	import type { SceneSequenceUsage } from '../lib/schema/flow';

	interface Props {
		slug: string;
		dialogId: string;
		nodeCount: number;
		sequenceCount: number;
	}

	let { slug, dialogId, nodeCount, sequenceCount }: Props = $props();

	let usageDialogEl = $state<HTMLDialogElement | null>(null);
	let usages = $state<SceneSequenceUsage[]>([]);
	let loading = $state(false);
	let loadError = $state('');

	const label = $derived.by(() => {
		if (nodeCount === 0 && sequenceCount === 0) return null;
		const seq = `${sequenceCount} sequence${sequenceCount === 1 ? '' : 's'}`;
		const nodes = `${nodeCount} node${nodeCount === 1 ? '' : 's'}`;
		return `Used in ${seq} · ${nodes}`;
	});

	const hasUsage = $derived(nodeCount > 0 || sequenceCount > 0);

	async function openUsageModal() {
		if (!hasUsage) return;
		loadError = '';
		loading = true;
		usages = [];
		await tick();
		usageDialogEl?.showModal();
		try {
			const res = await api<{ usages: SceneSequenceUsage[] }>(
				`/api/projects/${slug}/dialogs/${dialogId}/usage`,
			);
			usages = res.usages;
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function closeUsageModal() {
		usageDialogEl?.close();
		loadError = '';
	}

	function nodeLabel(count: number): string {
		return `${count} node${count === 1 ? '' : 's'}`;
	}
</script>

{#if label}
	{#if hasUsage}
		<button type="button" class="usage-trigger" onclick={openUsageModal}>
			{label}
		</button>
	{:else}
		<span class="usage-static">{label}</span>
	{/if}
{/if}

<dialog bind:this={usageDialogEl} class="modal" onclose={closeUsageModal}>
	<div class="modal-panel">
		<header class="modal-header">
			<h2>Sequence usage</h2>
		</header>
		<div class="modal-body">
			{#if loading}
				<p class="muted">Loading…</p>
			{:else if loadError}
				<p class="error">{loadError}</p>
			{:else if usages.length === 0}
				<p class="muted">This scene is not used in any sequence.</p>
			{:else}
				<ul class="usage-list">
					{#each usages as usage (usage.sequenceId)}
						<li>
							<a
								class="usage-card"
								href={`/projects/${slug}/sequences/${usage.sequenceId}`}
							>
								<span class="usage-name">{usage.displayName}</span>
								<span class="usage-id">{usage.sequenceId}</span>
								<span class="usage-count">{nodeLabel(usage.nodeCount)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeUsageModal}>Close</button>
			</div>
		</footer>
	</div>
</dialog>

<style>
	.usage-trigger {
		display: inline;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: inherit;
		color: var(--accent);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 2px;
		transition: text-decoration-color 0.15s;
	}

	.usage-trigger:hover {
		text-decoration-color: var(--accent);
	}

	.usage-static {
		color: inherit;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.error {
		margin: 0;
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
		max-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.modal-footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.modal-footer-right {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.usage-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.usage-card {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		gap: 0.15rem 0.75rem;
		padding: 0.75rem 0.9rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
		transition: border-color 0.15s, background 0.15s;
	}

	.usage-card:hover {
		border-color: var(--accent-dim);
		background: var(--bg-hover);
		text-decoration: none;
	}

	.usage-name {
		grid-column: 1;
		grid-row: 1;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.usage-id {
		grid-column: 1;
		grid-row: 2;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.usage-count {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}
</style>
