<script lang="ts">
	import { onMount, tick } from 'svelte';

	interface Props {
		slug: string;
		dialogId: string | null;
		sequenceId?: string;
		title?: string;
		onclose: () => void;
	}

	let { slug, dialogId, sequenceId, title = 'Edit scene', onclose }: Props = $props();

	type EditorComponent = typeof import('./DialogGraphEditor.svelte').default;

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let Editor = $state<EditorComponent | null>(null);
	let loadError = $state('');

	onMount(async () => {
		try {
			const mod = await import('./DialogGraphEditor.svelte');
			Editor = mod.default;
		} catch (e) {
			loadError = (e as Error).message;
		}
	});

	$effect(() => {
		if (dialogId) {
			tick().then(() => dialogEl?.showModal());
		} else {
			dialogEl?.close();
		}
	});

	function handleClose() {
		onclose();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="dialog-editor-modal"
	onclose={handleClose}
	onclick={(e) => {
		if (e.target === dialogEl) handleClose();
	}}
>
	<div class="modal-panel" role="document" onclick={(e) => e.stopPropagation()}>
		<header class="modal-header">
			<h2>{title}</h2>
			<div class="header-actions">
				{#if dialogId}
					<a
						class="btn"
						href={`/projects/${slug}/scenes/${dialogId}?from=sequence${sequenceId ? `&sequence=${sequenceId}` : ''}`}
					>
						Open full editor
					</a>
				{/if}
				<button type="button" class="btn btn-primary" onclick={handleClose}>Done</button>
			</div>
		</header>
		<div class="modal-body">
			{#if loadError}
				<p class="error">{loadError}</p>
			{:else if dialogId && Editor}
				{#key dialogId}
					<Editor {slug} {dialogId} embedded />
				{/key}
			{:else if dialogId}
				<p class="muted">Loading editor…</p>
			{/if}
		</div>
	</div>
</dialog>

<style>
	.dialog-editor-modal {
		border: none;
		padding: 0;
		margin: 0;
		width: 100vw;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		background: transparent;
	}

	.dialog-editor-modal::backdrop {
		background: rgba(0, 0, 0, 0.65);
	}

	.modal-panel {
		display: flex;
		flex-direction: column;
		width: min(96vw, 90rem);
		height: min(92dvh, 56rem);
		margin: 4dvh auto;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.modal-body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.modal-body :global(.scene-editor.embedded),
	.modal-body :global(.editor-shell.embedded) {
		margin: 0;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.modal-body :global(.scene-editor.embedded .editor-layout),
	.modal-body :global(.editor-shell.embedded .editor-layout) {
		flex: 1;
		min-height: 0;
		height: auto;
	}

	.error {
		padding: 1rem;
		color: var(--error);
	}

	.muted {
		padding: 1rem;
		color: var(--text-muted);
	}
</style>
