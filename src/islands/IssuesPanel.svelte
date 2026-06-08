<script lang="ts">
import { onMount } from 'svelte';
import { api } from '../lib/api';
import type { ValidationIssue } from '../lib/compile/validate';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let issues = $state<ValidationIssue[]>([]);
let loading = $state(true);
let filter = $state<'all' | 'error' | 'warning'>('all');

const CODE_LABELS: Record<string, string> = {
	undefined_character_state: 'Undefined character state',
	unused_character_state: 'Unused character state',
	unused_branch: 'Unused scene branch',
	unused_choice_branch: 'Unused choice branch',
	unreachable_dialog: 'Unreachable scene node',
	unused_dialog: 'Unused scene',
	unknown_speaker: 'Unknown speaker',
	empty_line: 'Empty line',
	empty_choice: 'Empty choice',
	empty_option: 'Empty option',
	invalid_jump: 'Invalid jump',
	dangling_edge: 'Dangling edge',
	missing_entry: 'Missing entry',
	unassigned_scene: 'Unassigned scene',
	missing_scene: 'Missing scene',
	dead_end_branch: 'Dead-end branch',
	dangling_flow_edge: 'Dangling sequence connection',
};

let filtered = $derived(issues.filter((i) => filter === 'all' || i.level === filter));

let grouped = $derived.by(() => {
	const map = new Map<string, ValidationIssue[]>();
	for (const issue of filtered) {
		const key = issue.code;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(issue);
	}
	return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
});

async function refresh() {
	loading = true;
	try {
		const res = await api<{ issues: ValidationIssue[] }>(`/api/projects/${slug}/validate`, {
			method: 'POST',
		});
		issues = res.issues;
	} finally {
		loading = false;
	}
}

function issueLink(issue: ValidationIssue): string | null {
	if (issue.flowNodeId) {
		const seq = issue.sequenceId ?? 'main';
		return `/projects/${slug}/sequences/${seq}#${issue.flowNodeId}`;
	}
	if (issue.dialogId && issue.nodeId) {
		return `/projects/${slug}/scenes/${issue.dialogId}#${issue.nodeId}`;
	}
	return null;
}

onMount(refresh);
</script>

<div class="toolbar">
	<button type="button" class="btn btn-primary" onclick={refresh} disabled={loading}>
		{loading ? 'Checking…' : 'Refresh'}
	</button>
	<select class="filter-select" bind:value={filter} aria-label="Filter issues">
		<option value="all">All</option>
		<option value="error">Errors</option>
		<option value="warning">Warnings</option>
	</select>
</div>

{#if loading}
	<p class="muted">Loading…</p>
{:else if filtered.length === 0}
	<p class="success">No issues found.</p>
{:else}
	<p class="summary">
		{issues.filter((i) => i.level === 'error').length} errors,
		{issues.filter((i) => i.level === 'warning').length} warnings
	</p>
	{#each grouped as [code, list]}
		<section class="issue-group">
			<h3>{CODE_LABELS[code] ?? code}</h3>
			<ul>
				{#each list as issue}
					<li class={issue.level}>
						<span class="badge badge-{issue.level === 'error' ? 'error' : 'warning'}"
							>{issue.level}</span
						>
						{issue.message}
						{#if issueLink(issue)}
							<a href={issueLink(issue)!} class="link">Open in editor</a>
						{:else if issue.characterId}
							<a href={`/projects/${slug}/characters`} class="link">Characters</a>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 0 1rem;
	}

	.filter-select {
		margin-left: auto;
		width: auto;
		min-width: 8rem;
	}

	.summary {
		color: var(--text-muted);
		margin: 1rem 0;
	}

	.issue-group {
		margin-bottom: 1.5rem;
	}

	.issue-group h3 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	.issue-group ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.issue-group li {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.link {
		margin-left: 0.5rem;
		font-size: 0.85rem;
	}

	.success {
		color: var(--success);
	}

	.muted {
		color: var(--text-muted);
	}
</style>
