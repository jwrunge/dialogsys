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
		unused_branch: 'Unused dialog branch',
		unused_choice_branch: 'Unused choice branch',
		unreachable_dialog: 'Unreachable dialog node',
		unused_dialog: 'Unused dialog',
		unknown_speaker: 'Unknown speaker',
		empty_line: 'Empty line',
		empty_choice: 'Empty choice',
		empty_option: 'Empty option',
		invalid_jump: 'Invalid jump',
		dangling_edge: 'Dangling edge',
		missing_entry: 'Missing entry',
	};

	let filtered = $derived(
		issues.filter((i) => filter === 'all' || i.level === filter),
	);

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
			const res = await api<{ issues: ValidationIssue[] }>(
				`/api/projects/${slug}/validate`,
				{ method: 'POST' },
			);
			issues = res.issues;
		} finally {
			loading = false;
		}
	}

	function nodeLink(issue: ValidationIssue): string | null {
		if (!issue.dialogId || !issue.nodeId) return null;
		return `/projects/${slug}/dialogs/${issue.dialogId}#${issue.nodeId}`;
	}

	onMount(refresh);
</script>

<div class="toolbar">
	<button type="button" class="btn btn-primary" onclick={refresh} disabled={loading}>
		{loading ? 'Checking…' : 'Refresh issues'}
	</button>
	<div class="filters">
		<button
			type="button"
			class="btn"
			class:active={filter === 'all'}
			onclick={() => (filter = 'all')}>All</button
		>
		<button
			type="button"
			class="btn"
			class:active={filter === 'error'}
			onclick={() => (filter = 'error')}>Errors</button
		>
		<button
			type="button"
			class="btn"
			class:active={filter === 'warning'}
			onclick={() => (filter = 'warning')}>Warnings</button
		>
	</div>
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
						{#if nodeLink(issue)}
							<a href={nodeLink(issue)!} class="link">Open in editor</a>
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
	.filters {
		display: flex;
		gap: 0.35rem;
	}

	.filters .btn.active {
		background: var(--accent-dim);
		color: #fff;
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
