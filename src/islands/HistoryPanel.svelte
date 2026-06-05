<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import type { SnapshotInfo, GitStatus } from '../lib/server/versioning';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let snapshots = $state<SnapshotInfo[]>([]);
	let git = $state<GitStatus>({
		available: true,
		message: '',
		installUrl: 'https://git-scm.com/downloads',
	});
	let retentionDays = $state(7);
	let debounceMs = $state(60_000);
	let intervalMs = $state(300_000);
	let loading = $state(true);
	let message = $state('');
	let restoring = $state<string | null>(null);

	async function load() {
		loading = true;
		try {
			const res = await api<{
				snapshots: SnapshotInfo[];
				config: { retentionDays: number; debounceMs: number; intervalMs: number };
				git: GitStatus;
			}>(`/api/projects/${slug}/snapshots`);
			snapshots = res.snapshots;
			git = res.git;
			retentionDays = res.config.retentionDays;
			debounceMs = res.config.debounceMs;
			intervalMs = res.config.intervalMs;
		} catch (e) {
			message = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function saveNow() {
		if (!git.available) return;
		message = '';
		try {
			const res = await api<{ created: boolean; snapshot: SnapshotInfo | null }>(
				`/api/projects/${slug}/snapshots`,
				{
					method: 'POST',
					body: JSON.stringify({ reason: 'Save now' }),
				},
			);
			message = res.created ? 'Snapshot saved.' : 'No changes since last snapshot.';
			await load();
		} catch (e) {
			message = (e as Error).message;
		}
	}

	async function restore(ref: string, branch: string) {
		if (!git.available) return;
		const label = branch.replace('autosave/', '').replace(/-/g, ':').replace('T', ' ');
		if (
			!confirm(
				`Restore project files to snapshot from ${label}?\n\nCurrent work will be overwritten. A new snapshot is created after restore.`,
			)
		) {
			return;
		}
		restoring = ref;
		message = '';
		try {
			await api(`/api/projects/${slug}/snapshots/restore`, {
				method: 'POST',
				body: JSON.stringify({ ref: branch }),
			});
			message = 'Restored. Reload the page to see updated content.';
			await load();
		} catch (e) {
			message = (e as Error).message;
		} finally {
			restoring = null;
		}
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}

	onMount(load);
</script>

{#if !git.available}
	<div class="alert" role="alert">
		<strong>Git is not installed</strong>
		<p>{git.message}</p>
		<p>
			<a href={git.installUrl} target="_blank" rel="noopener noreferrer">Install Git</a>
			— then restart <code>npm run dev</code>. Autosave and History are disabled until then;
			your project files still save normally.
		</p>
	</div>
{:else}
	<div class="toolbar">
		<button type="button" class="btn btn-primary" onclick={saveNow}>Save snapshot now</button>
		<button type="button" class="btn" onclick={load} disabled={loading}>Refresh</button>
	</div>

	<p class="hint">
		Git autosave runs in this project folder (local repo, not pushed to GitHub). Snapshots are
		kept for <strong>{retentionDays} days</strong>. Saves debounce every {Math.round(
			debounceMs / 1000,
		)}s; background interval every {Math.round(intervalMs / 1000)}s while a project page is
		open.
	</p>
{/if}

{#if message}
	<p class="msg">{message}</p>
{/if}

{#if git.available}
	{#if loading}
		<p class="muted">Loading snapshots…</p>
	{:else if snapshots.length === 0}
		<p class="muted">No snapshots yet. Edit and save — snapshots are created automatically.</p>
	{:else}
		<table class="table">
			<thead>
				<tr>
					<th>When</th>
					<th>Reason</th>
					<th>Ref</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each snapshots as snap}
					<tr>
						<td>{formatDate(snap.createdAt)}</td>
						<td>{snap.message || '—'}</td>
						<td><code>{snap.ref}</code></td>
						<td>
							<button
								type="button"
								class="btn"
								disabled={restoring !== null}
								onclick={() => restore(snap.ref, snap.branch)}
							>
								{restoring === snap.ref ? 'Restoring…' : 'Restore'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
{/if}

<style>
	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 0 1rem;
	}

	.alert {
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
		background: rgba(232, 184, 74, 0.12);
		border: 1px solid var(--warning);
		border-radius: var(--radius);
	}

	.alert strong {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--warning);
	}

	.alert p {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 1rem 0;
	}

	.msg {
		margin: 0.75rem 0;
		color: var(--success);
	}

	.muted {
		color: var(--text-muted);
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
	}
</style>
