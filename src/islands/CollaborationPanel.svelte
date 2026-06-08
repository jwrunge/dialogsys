<script lang="ts">
import { onMount } from 'svelte';
import { api, apiValidated } from '../lib/api';
import { DIRTY_CHANGE_EVENT, SYNC_CONFLICT_EVENT } from '../lib/client/dirty-state';
import { formatDateTime } from '../lib/i18n/format';
import { settingsResponseSchema } from '../lib/schema/api-responses';
import type { OriginMeta } from '../lib/schema/origin';

type OriginsResponse = {
	origins: OriginMeta[];
	clientId: string;
	activeOriginId: string;
};

type OriginDiffEntry = {
	path: string;
	kind: 'added' | 'removed' | 'modified';
	category: string;
};

type OriginDiffResult = {
	fromOriginId: string;
	toOriginId: string;
	entries: OriginDiffEntry[];
};

let { slug }: { slug: string } = $props();

let readOnly = $state(false);

let origins = $state<OriginMeta[]>([]);
let clientId = $state('');
let activeOriginId = $state('');
let ready = $state(false);
let switching = $state(false);
let error = $state('');
let hidden = $state(true);
let dirty = $state(false);
let compareOriginId = $state('');
let diff = $state<OriginDiffEntry[]>([]);
let diffLoading = $state(false);
let remoteBanner = $state('');
let renameOriginId = $state<string | null>(null);
let renameLabel = $state('');
let confirmSwitchId = $state<string | null>(null);
let conflictPath = $state('');
let conflictOpen = $state(false);

const POLL_MS = 30_000;

function labelFor(origin: OriginMeta): string {
	if (origin.label?.trim()) return origin.label.trim();
	if (origin.isSelf) return 'This device';
	return `${origin.originId.slice(0, 8)}…`;
}

async function load() {
	try {
		const res = await api<OriginsResponse>(`/api/projects/${slug}/origins`);
		origins = res.origins;
		clientId = res.clientId;
		activeOriginId = res.activeOriginId;
		hidden = false;
		ready = true;
		checkRemoteUpdates(res.origins, res.activeOriginId);
	} catch {
		hidden = true;
	}
}

function checkRemoteUpdates(list: OriginMeta[], activeId: string) {
	const others = list.filter((o) => o.originId !== activeId);
	if (others.length === 0) {
		remoteBanner = '';
		return;
	}
	const newest = [...others].sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	)[0];
	if (!newest) return;
	remoteBanner = `${labelFor(newest)} updated ${formatDateTime(newest.updatedAt)}. Switch threads to review.`;
}

async function loadDiff() {
	if (!compareOriginId || compareOriginId === activeOriginId) {
		diff = [];
		return;
	}
	diffLoading = true;
	try {
		const res = await api<OriginDiffResult>(
			`/api/projects/${slug}/origins/diff?from=${encodeURIComponent(activeOriginId)}&to=${encodeURIComponent(compareOriginId)}`,
		);
		diff = res.entries;
	} catch (e) {
		error = (e as Error).message;
		diff = [];
	} finally {
		diffLoading = false;
	}
}

function requestSwitch(originId: string) {
	if (originId === activeOriginId || switching || readOnly) return;
	if (dirty) {
		confirmSwitchId = originId;
		return;
	}
	void switchTo(originId);
}

async function switchTo(originId: string) {
	switching = true;
	error = '';
	confirmSwitchId = null;
	try {
		await api(`/api/projects/${slug}/origins`, {
			method: 'POST',
			body: JSON.stringify({ originId }),
		});
		window.location.reload();
	} catch (e) {
		error = (e as Error).message;
		switching = false;
	}
}

async function saveLabel() {
	if (!renameOriginId) return;
	const label = renameLabel.trim();
	if (!label) return;
	try {
		await api(`/api/projects/${slug}/origins/label`, {
			method: 'PUT',
			body: JSON.stringify({ originId: renameOriginId, label }),
		});
		renameOriginId = null;
		renameLabel = '';
		await load();
	} catch (e) {
		error = (e as Error).message;
	}
}

async function resolveConflict(action: 'reload' | 'force') {
	if (!conflictPath) return;
	try {
		await api(`/api/projects/${slug}/sync/conflict`, {
			method: 'POST',
			body: JSON.stringify({ path: conflictPath, action }),
		});
		conflictOpen = false;
		if (action === 'reload') {
			window.location.reload();
		}
	} catch (e) {
		error = (e as Error).message;
	}
}

function onDirtyChange(event: Event) {
	dirty = (event as CustomEvent<{ dirty: boolean }>).detail.dirty;
}

function onSyncConflict(event: Event) {
	const detail = (event as CustomEvent<{ path: string }>).detail;
	conflictPath = detail.path;
	conflictOpen = true;
}

onMount(() => {
	void load();
	void apiValidated('/api/settings', settingsResponseSchema).then((settings) => {
		readOnly = settings.storageMode === 'remote' && settings.syncAccessRole === 'read';
	});
	const poll = setInterval(() => void load(), POLL_MS);
	window.addEventListener(DIRTY_CHANGE_EVENT, onDirtyChange);
	window.addEventListener(SYNC_CONFLICT_EVENT, onSyncConflict);
	return () => {
		clearInterval(poll);
		window.removeEventListener(DIRTY_CHANGE_EVENT, onDirtyChange);
		window.removeEventListener(SYNC_CONFLICT_EVENT, onSyncConflict);
	};
});

$effect(() => {
	if (compareOriginId) void loadDiff();
});
</script>

{#if !hidden}
	<div class="collab-panel" data-transmut="include">
		<div class="panel-head">
			<span class="label">Working thread</span>
			{#if readOnly}
				<span class="badge-readonly">Read-only</span>
			{/if}
		</div>

		{#if remoteBanner}
			<p class="remote-banner">{remoteBanner}</p>
		{/if}

		<div class="origin-list">
			{#each origins as origin (origin.originId)}
				<div class="origin-card" class:active={origin.originId === activeOriginId}>
					<button
						type="button"
						class="origin-main"
						disabled={switching || readOnly}
						onclick={() => requestSwitch(origin.originId)}
					>
						<span class="name" data-transmut-skip>{labelFor(origin)}</span>
						<span class="meta" data-transmut-skip>
							{formatDateTime(origin.updatedAt)}
							{#if origin.isSelf} · yours{/if}
							{#if origin.originId === activeOriginId} · active{/if}
						</span>
					</button>
					{#if !readOnly}
						<button
							type="button"
							class="btn-icon"
							title="Rename thread"
							disabled={switching}
							onclick={() => {
								renameOriginId = origin.originId;
								renameLabel = origin.label ?? '';
							}}
						>
							✎
						</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="compare-row">
			<label>
				Compare with
				<select bind:value={compareOriginId} disabled={!ready}>
					<option value="">—</option>
					{#each origins as origin (origin.originId)}
						{#if origin.originId !== activeOriginId}
							<option value={origin.originId}>{labelFor(origin)}</option>
						{/if}
					{/each}
				</select>
			</label>
		</div>

		{#if compareOriginId}
			{#if diffLoading}
				<p class="hint">Loading changes…</p>
			{:else if diff.length === 0}
				<p class="hint">No file differences between these threads.</p>
			{:else}
				<ul class="diff-list">
					{#each diff as entry (entry.path)}
						<li>
							<span class="diff-kind">{entry.kind}</span>
							<span class="diff-cat">{entry.category}</span>
							<code data-transmut-skip>{entry.path}</code>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		<p class="hint">
			Each device keeps its own thread on the sync server. Switch to continue from a teammate&apos;s
			latest save. Future text authoring will sync the same JSON scene files underneath.
		</p>

		{#if error}
			<p class="error" data-transmut-skip>{error}</p>
		{/if}
	</div>
{/if}

<dialog open={confirmSwitchId !== null} class="modal">
	<form
		class="modal-panel modal-panel-sm"
		onsubmit={(e) => {
			e.preventDefault();
			if (confirmSwitchId) void switchTo(confirmSwitchId);
		}}
	>
		<header class="modal-header">
			<h2>Unsaved changes</h2>
		</header>
		<p class="modal-body">Switching threads will reload the project and discard unsaved edits.</p>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={() => (confirmSwitchId = null)}>Cancel</button>
				<button type="submit" class="btn btn-primary">Switch anyway</button>
			</div>
		</footer>
	</form>
</dialog>

<dialog open={renameOriginId !== null} class="modal">
	<form
		class="modal-panel modal-panel-sm"
		onsubmit={(e) => {
			e.preventDefault();
			void saveLabel();
		}}
	>
		<header class="modal-header">
			<h2>Rename thread</h2>
		</header>
		<div class="modal-body field">
			<label for="thread-label">Display name</label>
			<input id="thread-label" bind:value={renameLabel} maxlength="64" />
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={() => (renameOriginId = null)}>Cancel</button>
				<button type="submit" class="btn btn-primary">Save</button>
			</div>
		</footer>
	</form>
</dialog>

<dialog open={conflictOpen} class="modal">
	<form class="modal-panel modal-panel-sm">
		<header class="modal-header">
			<h2>Sync conflict</h2>
		</header>
		<p class="modal-body">
			<code data-transmut-skip>{conflictPath}</code> changed on the server since your last sync.
		</p>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={() => resolveConflict('reload')}>
					Reload server copy
				</button>
				<button type="button" class="btn btn-primary" onclick={() => resolveConflict('force')}>
					Keep mine
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	.collab-panel {
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.badge-readonly {
		font-size: 0.7rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.remote-banner {
		margin: 0 0 0.6rem;
		padding: 0.5rem 0.65rem;
		font-size: 0.8rem;
		color: var(--text-muted);
		background: rgba(108, 158, 255, 0.08);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.origin-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.origin-card {
		display: flex;
		gap: 0.35rem;
		align-items: stretch;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}

	.origin-card.active {
		border-color: var(--accent-dim);
	}

	.origin-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.45rem 0.65rem;
		border: none;
		background: transparent;
		color: var(--text);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.origin-main:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-icon {
		align-self: center;
		margin-right: 0.35rem;
		border: 1px solid var(--border);
		background: var(--bg-hover);
		border-radius: var(--radius);
		padding: 0.2rem 0.45rem;
		cursor: pointer;
	}

	.name {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.meta {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.compare-row {
		margin-top: 0.65rem;
	}

	.compare-row label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.compare-row select {
		max-width: 280px;
	}

	.diff-list {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		max-height: 160px;
		overflow: auto;
	}

	.diff-list li {
		font-size: 0.78rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border);
	}

	.diff-kind {
		text-transform: uppercase;
		font-size: 0.65rem;
		color: var(--accent-dim);
		margin-right: 0.35rem;
	}

	.diff-cat {
		color: var(--text-muted);
		margin-right: 0.35rem;
	}

	.hint {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.error {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--error);
	}
</style>
