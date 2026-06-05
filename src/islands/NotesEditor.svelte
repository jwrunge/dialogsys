<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import { api } from '../lib/api';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let overview = $state('');
	let status = $state('');
	let loadError = $state('');

	let previewHtml = $derived.by(() => {
		try {
			return DOMPurify.sanitize(marked.parse(overview || '_No content yet._') as string);
		} catch {
			return '<p>Preview unavailable</p>';
		}
	});

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	async function loadOverview() {
		const res = await api<{ content: string }>(
			`/api/projects/${slug}/notes/overview.md`,
		);
		overview = res.content;
	}

	function scheduleSave(content: string) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			try {
				await api(`/api/projects/${slug}/notes/overview.md`, {
					method: 'PUT',
					body: JSON.stringify({ content }),
				});
				status = 'Saved';
				setTimeout(() => (status = ''), 1500);
			} catch (e) {
				status = (e as Error).message;
			}
		}, 400);
	}

	onMount(async () => {
		try {
			await loadOverview();
		} catch (e) {
			loadError = (e as Error).message;
		}
	});
</script>

<p class="scene-hint">
	<strong>Scene direction in dialog:</strong> For beats like “John looks mournfully at Cassie,” use
	<strong>+ Direction</strong> nodes in the <a href={`/projects/${slug}/dialogs`}>dialog graph</a>.
</p>

<div class="header">
	<h2>Overview</h2>
	<span class="status">{status}</span>
</div>

{#if loadError}
	<p class="error">{loadError}</p>
{/if}

<textarea
	class="editor"
	bind:value={overview}
	oninput={() => scheduleSave(overview)}
	rows="16"
	placeholder="Project overview, tone, pillars…"
></textarea>

<div class="preview-pane">
	<h3>Preview</h3>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html previewHtml}
</div>

<style>
	.scene-hint {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.error {
		color: var(--error);
		margin: 0.5rem 0;
	}

	.editor {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.9rem;
		min-height: 280px;
	}
</style>
