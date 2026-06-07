<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';

	type SettingsResponse = {
		projectsRoot: string;
		resolvedPath: string;
		source: 'env' | 'config' | 'default';
		envOverride: boolean;
		configFile: string | null;
	};

	let projectsRoot = $state('./projects');
	let resolvedPath = $state('');
	let source = $state<SettingsResponse['source']>('default');
	let envOverride = $state(false);
	let configFile = $state<string | null>(null);
	let ready = $state(false);
	let saving = $state(false);
	let error = $state('');
	let saved = $state(false);

	const sourceLabel = $derived.by(() => {
		switch (source) {
			case 'env':
				return 'Environment variable (DIALOGSYS_PROJECTS_ROOT)';
			case 'config':
				return 'Settings file';
			default:
				return 'Default';
		}
	});

	async function load() {
		ready = false;
		error = '';
		try {
			const res = await api<SettingsResponse>('/api/settings');
			projectsRoot = res.projectsRoot;
			resolvedPath = res.resolvedPath;
			source = res.source;
			envOverride = res.envOverride;
			configFile = res.configFile;
			ready = true;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function save(e: Event) {
		e.preventDefault();
		if (saving || envOverride) return;
		error = '';
		saved = false;
		saving = true;
		try {
			const res = await api<SettingsResponse>('/api/settings', {
				method: 'PUT',
				body: JSON.stringify({ projectsRoot: projectsRoot.trim() }),
			});
			projectsRoot = res.projectsRoot;
			resolvedPath = res.resolvedPath;
			source = res.source;
			configFile = res.configFile;
			saved = true;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

{#if !ready && !error}
	<p class="muted">Loading settings…</p>
{:else}
	<form class="settings-form" onsubmit={save}>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		{#if saved}
			<p class="success">Settings saved. New projects will use this path.</p>
		{/if}

		<div class="field">
			<label for="projects-root">Projects folder</label>
			<input
				id="projects-root"
				bind:value={projectsRoot}
				required
				autocomplete="off"
				placeholder="./projects"
				disabled={envOverride}
			/>
			<p class="hint">
				Relative paths are resolved from the app directory. Each project is a subfolder with
				<code>project.json</code>, scenes, sequences, and more.
			</p>
		</div>

		{#if resolvedPath}
			<div class="info-card">
				<p><strong>Current location:</strong> <code>{resolvedPath}</code></p>
				<p class="hint">Active source: {sourceLabel}</p>
				{#if configFile}
					<p class="hint">Saved in <code>{configFile}</code></p>
				{/if}
			</div>
		{/if}

		{#if envOverride}
			<p class="warning">
				<code>DIALOGSYS_PROJECTS_ROOT</code> is set in the environment, so it overrides this
				setting. Remove that variable to control the path from here.
			</p>
		{/if}

		<div class="actions">
			<a class="btn" href="/">← Projects</a>
			<button type="submit" class="btn btn-primary" disabled={saving || envOverride}>
				{saving ? 'Saving…' : 'Save'}
			</button>
		</div>
	</form>
{/if}

<style>
	.settings-form {
		max-width: 36rem;
	}

	.field {
		margin-bottom: 1.25rem;
	}

	.hint {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.hint code,
	.info-card code {
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.info-card {
		margin-bottom: 1.25rem;
		padding: 0.9rem 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.info-card p {
		margin: 0 0 0.35rem;
		font-size: 0.9rem;
	}

	.info-card p:last-child {
		margin-bottom: 0;
	}

	.warning {
		margin: 0 0 1rem;
		padding: 0.75rem 0.9rem;
		font-size: 0.85rem;
		color: var(--warning);
		background: rgba(232, 184, 74, 0.08);
		border: 1px solid var(--warning);
		border-radius: var(--radius);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.error {
		color: var(--error);
		margin: 0 0 1rem;
	}

	.success {
		color: var(--success);
		margin: 0 0 1rem;
	}

	.muted {
		color: var(--text-muted);
	}
</style>
