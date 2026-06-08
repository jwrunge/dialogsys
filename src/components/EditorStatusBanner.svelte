<script lang="ts">
interface Props {
	loadError?: string;
	saveStatus?: string;
}

let { loadError = '', saveStatus = '' }: Props = $props();
</script>

<div data-transmut="include">
{#if loadError}
	<p class="banner banner-error" role="alert" data-transmut-skip>{loadError}</p>
{:else if saveStatus}
	<p class="banner banner-status" data-transmut-skip>{saveStatus}</p>
{/if}
</div>

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
