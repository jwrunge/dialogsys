<script lang="ts">
import { api } from '../lib/api';
import { isProjectReadOnly } from '../lib/client/project-access';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let csv = $state('');
let status = $state('');
let importing = $state(false);
let expanded = $state(false);

async function exportCsv() {
	status = '';
	try {
		const res = await fetch(`/api/projects/${slug}/writer/lines?format=csv`);
		if (!res.ok) throw new Error('Export failed');
		const text = await res.text();
		const blob = new Blob([text], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slug}-lines.csv`;
		a.click();
		URL.revokeObjectURL(url);
		status = 'Exported CSV';
	} catch (e) {
		status = (e as Error).message;
	}
}

async function importCsv() {
	if (isProjectReadOnly()) {
		status = 'Read-only connection';
		return;
	}
	if (!csv.trim()) {
		status = 'Paste CSV first';
		return;
	}
	importing = true;
	status = '';
	try {
		const res = await api<{ updatedScenes: number; lineCount: number }>(
			`/api/projects/${slug}/writer/lines`,
			{
				method: 'POST',
				body: JSON.stringify({ csv }),
			},
		);
		status = `Updated ${res.updatedScenes} scene(s), ${res.lineCount} line(s)`;
		csv = '';
	} catch (e) {
		status = (e as Error).message;
	} finally {
		importing = false;
	}
}
</script>

<section class="writer-panel" data-transmut="include">
	<button type="button" class="toggle" onclick={() => (expanded = !expanded)}>
		{expanded ? '▼' : '▶'} Writer lines (CSV)
	</button>
	{#if expanded}
		<p class="hint">
			Export dialogue lines for spreadsheet or text editing. Import updates line text and speaker on
			existing line nodes only — graph structure stays in JSON.
		</p>
		<div class="actions">
			<button type="button" class="btn" onclick={exportCsv}>Export all lines</button>
		</div>
		<label class="field">
			Import CSV
			<textarea
				bind:value={csv}
				rows="6"
				placeholder="scene_id,node_id,speaker,text"
				disabled={isProjectReadOnly()}
			></textarea>
		</label>
		<button
			type="button"
			class="btn btn-primary"
			disabled={importing || isProjectReadOnly()}
			onclick={importCsv}
		>
			{importing ? 'Importing…' : 'Import lines'}
		</button>
		{#if status}
			<p class="status" data-transmut-skip>{status}</p>
		{/if}
	{/if}
</section>

<style>
	.writer-panel {
		margin: 1rem 0;
		padding: 0.75rem 0.9rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.toggle {
		border: none;
		background: transparent;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		color: var(--text);
	}

	.hint {
		margin: 0.5rem 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.actions {
		margin-bottom: 0.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	textarea {
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.status {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>
