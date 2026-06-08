<script lang="ts">
interface Props {
	loadError?: string;
	saveStatus?: string;
}

let { loadError = '', saveStatus = '' }: Props = $props();
</script>

{#if loadError}
	<p class="banner banner-error" role="alert">{loadError}</p>
{:else if saveStatus}
	<p class="banner banner-status">{saveStatus}</p>
{/if}

<style>
	.banner {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
	}

	.banner-error {
		color: var(--error);
	}

	.banner-status {
		color: var(--text-muted);
	}
</style>
