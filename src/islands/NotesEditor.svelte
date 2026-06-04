<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import { api } from '../lib/api';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let tab = $state<'overview' | 'direction'>('overview');
	let overview = $state('');
	let directionFiles = $state<string[]>([]);
	let selectedDirection = $state('');
	let directionContent = $state('');
	let status = $state('');
	let previewHtml = $derived(
		DOMPurify.sanitize(marked.parse(tab === 'overview' ? overview : directionContent) as string),
	);

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	async function loadOverview() {
		const res = await api<{ content: string }>(
			`/api/projects/${slug}/notes/overview.md`,
		);
		overview = res.content;
	}

	async function loadDirectionList() {
		const res = await api<{ files: string[] }>(
			`/api/projects/${slug}/notes/direction/placeholder.md?list=direction`,
		);
		directionFiles = res.files;
		if (directionFiles.length && !selectedDirection) {
			selectedDirection = directionFiles[0];
			await loadDirectionFile(selectedDirection);
		}
	}

	async function loadDirectionFile(name: string) {
		const res = await api<{ content: string }>(
			`/api/projects/${slug}/notes/direction/${name}`,
		);
		directionContent = res.content;
	}

	function scheduleSave(path: string, content: string) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			try {
				await api(`/api/projects/${slug}/notes/${path}`, {
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

	async function newDirectionNote() {
		const name = `scene_${Date.now()}.md`;
		const content = `---\nscene: \ncharacters: []\nlinkedDialog: \n---\n\n# Direction note\n\n`;
		await api(`/api/projects/${slug}/notes/direction/${name}`, {
			method: 'PUT',
			body: JSON.stringify({ content }),
		});
		directionFiles = [...directionFiles, name].sort();
		selectedDirection = name;
		directionContent = content;
	}

	onMount(async () => {
		await loadOverview();
		await loadDirectionList();
	});
</script>

<div class="tabs">
	<button
		type="button"
		class="tab"
		class:active={tab === 'overview'}
		onclick={() => (tab = 'overview')}>Overview</button
	>
	<button
		type="button"
		class="tab"
		class:active={tab === 'direction'}
		onclick={() => {
			tab = 'direction';
			loadDirectionList();
		}}>Direction notes</button
	>
	<span class="status">{status}</span>
</div>

{#if tab === 'overview'}
	<textarea
		class="editor"
		bind:value={overview}
		oninput={() => scheduleSave('overview.md', overview)}
		rows="16"
		placeholder="Project overview, tone, pillars…"
	></textarea>
{:else}
	<div class="direction-layout">
		<aside>
			<button type="button" class="btn" onclick={newDirectionNote}>New note</button>
			<ul>
				{#each directionFiles as file}
					<li>
						<button
							type="button"
							class="file-btn"
							class:active={selectedDirection === file}
							onclick={async () => {
								selectedDirection = file;
								await loadDirectionFile(file);
							}}>{file}</button
						>
					</li>
				{/each}
			</ul>
		</aside>
		<textarea
			class="editor"
			bind:value={directionContent}
			oninput={() => {
				if (selectedDirection) scheduleSave(`direction/${selectedDirection}`, directionContent);
			}}
			rows="16"
			placeholder="Scene descriptors, character actions…"
		></textarea>
	</div>
{/if}

<div class="preview-pane">
	<h3>Preview</h3>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html previewHtml}
</div>

<style>
	.editor {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.9rem;
		min-height: 280px;
	}

	.direction-layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 1rem;
	}

	aside ul {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
	}

	.file-btn {
		width: 100%;
		text-align: left;
		padding: 0.35rem 0.5rem;
		border: none;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		border-radius: var(--radius);
	}

	.file-btn.active,
	.file-btn:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
</style>
