<script lang="ts">
import { onMount } from 'svelte';
import { api } from '../lib/api';
import { downloadExport } from '../lib/client/download';
import type { ValidationIssue } from '../lib/compile/validate';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let issues = $state<ValidationIssue[]>([]);
let exporting = $state(false);
let result = $state<{ exportedAt: string; dialogCount: number; filename: string } | null>(null);
let error = $state('');

async function validate() {
	const res = await api<{ issues: ValidationIssue[] }>(`/api/projects/${slug}/validate`, {
		method: 'POST',
	});
	issues = res.issues;
}

async function exportProject(format: 'godot' | 'generic') {
	exporting = true;
	error = '';
	result = null;
	try {
		await validate();
		const hasErrors = issues.some((i) => i.level === 'error');
		if (hasErrors) {
			error = 'Fix errors before exporting.';
			return;
		}
		const meta = await downloadExport(slug, format);
		result = meta;
	} catch (e) {
		error = (e as Error).message;
	} finally {
		exporting = false;
	}
}

onMount(validate);
</script>

<div class="toolbar">
	<button type="button" class="btn" onclick={validate}>Validate</button>
	<button
		type="button"
		class="btn btn-primary"
		onclick={() => exportProject('godot')}
		disabled={exporting}
	>
		{exporting ? 'Exporting…' : 'Export Godot (.zip)'}
	</button>
	<button type="button" class="btn" onclick={() => exportProject('generic')} disabled={exporting}>
		Export generic (.zip)
	</button>
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

{#if result}
	<p class="success">
		Downloaded {result.filename} — {result.dialogCount} scene(s) at
		{new Date(result.exportedAt).toLocaleString()}
	</p>
{/if}

{#if issues.length > 0}
	<ul class="issues">
		{#each issues as issue}
			<li class={issue.level}>
				<span class="badge badge-{issue.level === 'error' ? 'error' : 'warning'}">{issue.level}</span>
				{issue.message}
				{#if issue.dialogId}<code>{issue.dialogId}</code>{/if}
				{#if issue.nodeId}<code>{issue.nodeId}</code>{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="muted">No validation issues. See <a href={`/projects/${slug}/issues`}>Issues</a> for full list.</p>
{/if}

<div class="instructions">
	<h3>Export formats</h3>
	<p class="muted">
		Export downloads a zip bundle. Upload portraits in the character editor; they are stored under
		<code>portraits/</code> in your project and included in both exports.
	</p>
	<h4>Godot</h4>
	<ol>
		<li>Unzip and copy the <code>godot/</code> folder into your game as <code>res://dialogue/</code></li>
		<li>Autoload <code>DialogueRunner.gd</code> from the export</li>
		<li>Portrait paths in JSON use <code>res://dialogue/portraits/…</code></li>
		<li>Call <code>start("scene_id")</code> and connect <code>line_shown</code>, <code>choices_shown</code>, <code>dialogue_ended</code></li>
		<li>Handle <code>run_command</code> for <code>set_var</code> and gameplay hooks</li>
	</ol>
	<h4>Generic</h4>
	<ol>
		<li>Unzip the <code>generic/</code> folder — portable JSON plus <code>portraits/</code> images</li>
		<li>Dialog JSON uses relative portrait paths (e.g. <code>portraits/foo.png</code>)</li>
		<li><code>characters.json</code> and <code>manifest.json</code> describe the bundle</li>
		<li>Wire into Unity, Unreal, or a custom runtime</li>
	</ol>
</div>

<style>
	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 0 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.issues {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}

	.issues li {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-left: 0.35rem;
	}

	.success {
		color: var(--success);
	}

	.error {
		color: var(--error);
	}

	.instructions {
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.instructions h3,
	.instructions h4 {
		margin: 0 0 0.35rem;
	}

	.instructions h4 {
		margin-top: 1rem;
		font-size: 0.95rem;
	}

	.instructions ol {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
	}
</style>
