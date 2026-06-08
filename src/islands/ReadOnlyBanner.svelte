<script lang="ts">
import { onMount } from 'svelte';
import { apiValidated } from '../lib/api';
import { setProjectReadOnly } from '../lib/client/project-access';
import { settingsResponseSchema } from '../lib/schema/api-responses';

let readOnly = $state(false);

onMount(async () => {
	try {
		const settings = await apiValidated('/api/settings', settingsResponseSchema);
		readOnly = settings.storageMode === 'remote' && settings.syncAccessRole === 'read';
		setProjectReadOnly(readOnly);
	} catch {
		readOnly = false;
		setProjectReadOnly(false);
	}
});
</script>

{#if readOnly}
	<p class="readonly-banner" data-transmut="include" role="status">
		Read-only connection — you can browse and compare threads but cannot save changes.
	</p>
{/if}

<style>
	.readonly-banner {
		margin: 0 0 1rem;
		padding: 0.65rem 0.85rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: rgba(232, 184, 74, 0.12);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
</style>
