<script lang="ts">
import { onMount } from 'svelte';
import { flushOfflineQueue, getOfflineQueueLength } from '../lib/client/offline-queue';

let pending = $state(0);
let syncing = $state(false);
let message = $state('');

function refresh() {
	pending = getOfflineQueueLength();
}

async function syncNow() {
	syncing = true;
	message = '';
	try {
		const result = await flushOfflineQueue();
		if (result.flushed > 0 && result.failed === 0) {
			message = `Synced ${result.flushed} change(s).`;
			window.location.reload();
		} else if (result.flushed > 0) {
			message = `Synced ${result.flushed}; ${result.failed} still pending.`;
		} else if (result.failed > 0) {
			message = 'Still offline — try again when connected.';
		}
	} catch (e) {
		message = (e as Error).message;
	} finally {
		syncing = false;
		refresh();
	}
}

onMount(() => {
	refresh();
	const onQueueChange = () => refresh();
	const onOnline = () => {
		refresh();
		if (getOfflineQueueLength() > 0) void syncNow();
	};
	window.addEventListener('dialogsys:offline-queue-change', onQueueChange);
	window.addEventListener('online', onOnline);
	return () => {
		window.removeEventListener('dialogsys:offline-queue-change', onQueueChange);
		window.removeEventListener('online', onOnline);
	};
});
</script>

{#if pending > 0}
	<p class="offline-banner" data-transmut="include" role="status">
		{pending} change{pending === 1 ? '' : 's'} waiting to sync.
		<button type="button" class="btn-inline" disabled={syncing} onclick={() => syncNow()}>
			{syncing ? 'Syncing…' : 'Sync now'}
		</button>
		{#if message}
			<span class="msg" data-transmut-skip>{message}</span>
		{/if}
	</p>
{/if}

<style>
	.offline-banner {
		margin: 0 0 1rem;
		padding: 0.65rem 0.85rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: rgba(108, 158, 255, 0.1);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.btn-inline {
		margin-left: 0.5rem;
		border: 1px solid var(--border);
		background: var(--bg-hover);
		border-radius: var(--radius);
		padding: 0.15rem 0.5rem;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.msg {
		display: block;
		margin-top: 0.35rem;
	}
</style>
