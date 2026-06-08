<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import { listSyncProjects } from '../lib/sync/client';
	import type { ProjectMeta } from '../lib/schema/project';
	import type { StorageMode } from '../lib/schema/settings';
	import CreateProjectForm from './CreateProjectForm.svelte';

	type SettingsResponse = {
		storageMode: StorageMode;
		syncServerUrl: string;
	};

	let storageMode = $state<StorageMode>('local');
	let syncServerUrl = $state('');
	let projects = $state<ProjectMeta[]>([]);
	let ready = $state(false);
	let loadError = $state('');

	async function load() {
		ready = false;
		loadError = '';
		try {
			const settings = await api<SettingsResponse>('/api/settings');
			storageMode = settings.storageMode ?? 'local';
			syncServerUrl = settings.syncServerUrl ?? '';

			if (storageMode === 'remote' && syncServerUrl) {
				projects = await listSyncProjects(syncServerUrl);
			} else {
				const res = await api<{ projects: ProjectMeta[] }>('/api/projects');
				projects = res.projects;
			}
			ready = true;
		} catch (e) {
			loadError = (e as Error).message;
			projects = [];
		}
	}

	onMount(load);
</script>

{#if loadError}
	<p class="error-banner">{loadError}</p>
{:else if !ready}
	<p class="muted">Loading projects…</p>
{:else}
	{#if storageMode === 'remote' && syncServerUrl}
		<p class="remote-banner">
			Projects sync through <code>{syncServerUrl}</code>. Each device keeps its own thread; switch
			threads inside a project to work from another device&apos;s latest save.
		</p>
	{/if}

	{#if projects.length === 0}
		<p class="muted">No projects yet. Create one below or open the bundled demo.</p>
		<p><a href="/projects/demo/characters" class="btn">Open demo project</a></p>
	{:else}
		<div class="card-grid">
			{#each projects as project (project.slug)}
				<a class="card project-card" href={`/projects/${project.slug}/characters`}>
					<h3>{project.displayName}</h3>
					<p class="slug">{project.slug}</p>
					{#if project.description}
						<p class="desc">{project.description}</p>
					{/if}
					{#if storageMode === 'remote'}
						<span class="badge">Remote</span>
					{/if}
				</a>
			{/each}
		</div>
	{/if}

	<section class="create-section">
		<h2>Create project</h2>
		<CreateProjectForm />
	</section>
{/if}

<style>
	.remote-banner {
		margin: 0 0 1rem;
		padding: 0.75rem 0.9rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.remote-banner code {
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.project-card {
		display: block;
		text-decoration: none;
		color: inherit;
		position: relative;
	}

	.project-card:hover {
		text-decoration: none;
	}

	.slug {
		margin: 0.15rem 0 0;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.desc {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.badge {
		display: inline-block;
		margin-top: 0.5rem;
		padding: 0.1rem 0.45rem;
		font-size: 0.7rem;
		border-radius: 999px;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.create-section {
		margin-top: 2.5rem;
	}

	.create-section h2 {
		font-size: 1.1rem;
		margin-bottom: 0.5rem;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.muted {
		color: var(--text-muted);
	}

	.error-banner {
		padding: 1rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
	}
</style>
