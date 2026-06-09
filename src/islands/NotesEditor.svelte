<script lang="ts">
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { onMount } from 'svelte';
import { api } from '../lib/api';
import { setCoauthorFocusPath } from '../lib/client/coauthor-focus';
import { DebouncedTask, SAVE_DEBOUNCE_MS } from '../lib/client/debouncedSave';
import { markClean, markDirty, notifySaveConflict } from '../lib/client/dirty-state';
import { isProjectReadOnly } from '../lib/client/project-access';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

const EXAMPLE = `# Project overview

Brief description of the setting and story.

## Tone

How should scenes feel? (e.g. cozy, tense, comic)

## Pillars

- Key theme or constraint
- Another design goal
`;

let overview = $state('');
let loadedContent = $state('');
let editing = $state(false);
let status = $state('');
let loadError = $state('');

let previewSource = $derived(overview.trim() || EXAMPLE);

let previewHtml = $derived.by(() => {
	try {
		return DOMPurify.sanitize(marked.parse(previewSource) as string);
	} catch {
		return '<p>Preview unavailable</p>';
	}
});

const saveTask = new DebouncedTask(SAVE_DEBOUNCE_MS, () => {
	void saveNow(overview).catch((e) => {
		status = (e as Error).message;
	});
});

async function loadOverview() {
	const res = await api<{ content: string }>(`/api/projects/${slug}/notes/overview.md`);
	overview = res.content;
	loadedContent = res.content;
}

async function saveNow(content: string) {
	try {
		await api(`/api/projects/${slug}/notes/overview.md`, {
			method: 'PUT',
			body: JSON.stringify({ content }),
		});
		loadedContent = content;
		status = 'Saved';
		markClean();
		setTimeout(() => (status = ''), 1500);
	} catch (e) {
		notifySaveConflict(e);
		throw e;
	}
}

function scheduleSave(_content: string) {
	if (isProjectReadOnly()) return;
	markDirty();
	saveTask.schedule();
}

function enterEditMode() {
	if (!overview.trim()) overview = EXAMPLE;
	editing = true;
}

async function exitEditMode() {
	editing = false;
	clearTimeout(saveTimer);
	if (overview !== loadedContent) {
		try {
			await saveNow(overview);
		} catch (e) {
			status = (e as Error).message;
		}
	}
}

onMount(async () => {
	setCoauthorFocusPath('notes/overview.md');
	try {
		await loadOverview();
	} catch (e) {
		loadError = (e as Error).message;
	}
	return () => setCoauthorFocusPath(null);
});
</script>

<div data-transmut="include">
<div class="header">
	<h2>Overview</h2>
	{#if status}
		<span class="status">{status}</span>
	{/if}
	<div class="header-actions">
		{#if editing}
			<button type="button" class="icon-btn" onclick={exitEditMode} aria-label="Show preview">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12.5l4.5 4.5L19 7.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		{:else}
			<button type="button" class="icon-btn" onclick={enterEditMode} aria-label="Edit markdown">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M13.5 6.5l3 3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		{/if}
	</div>
</div>

{#if loadError}
	<p class="error">{loadError}</p>
{:else if editing}
	<textarea
		class="editor"
		bind:value={overview}
		oninput={() => scheduleSave(overview)}
		rows="16"
		aria-label="Overview markdown"
	></textarea>
{:else}
	<div class="preview-pane" class:example={!overview.trim()}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html previewHtml}
	</div>
{/if}
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.header-actions {
		margin-left: auto;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		color: var(--text);
		border-color: var(--accent-dim);
		background: var(--bg-hover);
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

	.preview-pane.example {
		color: var(--text-muted);
	}
</style>
