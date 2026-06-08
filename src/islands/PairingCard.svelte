<script lang="ts">
interface Props {
	syncServerUrl: string;
	hasToken: boolean;
	clientId: string;
}

let { syncServerUrl, hasToken, clientId }: Props = $props();

let copied = $state('');

const pairingText = $derived(
	JSON.stringify(
		{
			syncServerUrl: syncServerUrl.trim(),
			note: 'Enter your access token manually on the other device (Settings).',
			clientId,
		},
		null,
		2,
	),
);

async function copy(text: string, label: string) {
	try {
		await navigator.clipboard.writeText(text);
		copied = label;
		setTimeout(() => {
			if (copied === label) copied = '';
		}, 2000);
	} catch {
		copied = '';
	}
}
</script>

{#if syncServerUrl.trim()}
	<section class="pairing-card" data-transmut="include">
		<h2>Connect another device</h2>
		<p class="hint">
			On the other computer, open Settings, choose Remote sync server, paste the URL below, and
			enter the same access token{hasToken ? '' : ' (after you save one here)'}.
		</p>
		<div class="field">
			<label>Server URL</label>
			<div class="copy-row">
				<code data-transmut-skip>{syncServerUrl}</code>
				<button type="button" class="btn" onclick={() => copy(syncServerUrl, 'url')}>
					{copied === 'url' ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
		<div class="field">
			<label>Setup notes</label>
			<div class="copy-row">
				<pre data-transmut-skip>{pairingText}</pre>
				<button type="button" class="btn" onclick={() => copy(pairingText, 'json')}>
					{copied === 'json' ? 'Copied' : 'Copy JSON'}
				</button>
			</div>
		</div>
	</section>
{/if}

<style>
	.pairing-card {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.pairing-card h2 {
		font-size: 1.05rem;
		margin: 0 0 0.35rem;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.copy-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	code,
	pre {
		flex: 1;
		margin: 0;
		padding: 0.5rem 0.65rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: auto;
	}

	pre {
		white-space: pre-wrap;
	}
</style>
