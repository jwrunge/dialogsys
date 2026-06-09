<script lang="ts">
import { onMount } from 'svelte';
import { api, apiValidated } from '../lib/api';
import {
	getCoauthorFocusPath,
	registerCoauthorFocusHandler,
	unregisterCoauthorFocusHandler,
} from '../lib/client/coauthor-focus';
import { settingsResponseSchema } from '../lib/schema/api-responses';
import {
	COAUTHOR_FILE_UPDATED_EVENT,
	COAUTHOR_PRESENCE_EVENT,
	type CoauthorFileUpdate,
	type CoauthorPeer,
	type CoauthorSession,
	connectCoauthorSession,
} from '../lib/sync/realtime';

type OriginsResponse = {
	activeOriginId: string;
	clientId: string;
};

let { slug }: { slug: string } = $props();

let hidden = $state(true);
let peers = $state<CoauthorPeer[]>([]);
let activeOriginId = $state('');
let clientId = $state('');
let remoteUpdate = $state<CoauthorFileUpdate | null>(null);
let reloading = $state(false);
let session: CoauthorSession | null = null;
let focusHandler: ((path: string | null) => void) | null = null;

function labelFor(peer: CoauthorPeer): string {
	if (peer.displayName?.trim()) return peer.displayName.trim();
	if (peer.deviceId === clientId) return 'You';
	return `${peer.deviceId.slice(0, 8)}…`;
}

function focusLabel(path: string | undefined): string {
	if (!path) return '';
	if (path.startsWith('dialogs/') && path.endsWith('.graph.json')) {
		return path.slice('dialogs/'.length, -'.graph.json'.length);
	}
	if (path.startsWith('sequences/') && path.endsWith('.graph.json')) {
		return `sequence:${path.slice('sequences/'.length, -'.graph.json'.length)}`;
	}
	if (path === 'characters.json') return 'characters';
	if (path === 'gameState.json') return 'game state';
	if (path.startsWith('notes/')) return path.slice('notes/'.length);
	return path;
}

function onPresence(event: Event) {
	const detail = (event as CustomEvent<{ peers: CoauthorPeer[] }>).detail;
	peers = (detail.peers ?? []).filter((peer) => peer.deviceId !== clientId);
}

function onFileUpdated(event: Event) {
	const update = (event as CustomEvent<CoauthorFileUpdate>).detail;
	if (update.originId === activeOriginId) return;
	const current = getCoauthorFocusPath();
	if (!current || update.path !== current) return;
	// Doc patches apply live in editors; full-file reload is for other assets.
	if (current.endsWith('.graph.json')) return;
	if (current === 'characters.json') return;
	if (current === 'gameState.json') return;
	if (current.startsWith('notes/')) return;
	remoteUpdate = update;
}

async function reloadRemoteFile() {
	if (!remoteUpdate) return;
	reloading = true;
	try {
		await api(`/api/projects/${slug}/sync/conflict`, {
			method: 'POST',
			body: JSON.stringify({ path: remoteUpdate.path, action: 'reload' }),
		});
		window.location.reload();
	} catch {
		reloading = false;
	}
}

onMount(() => {
	let cancelled = false;

	void (async () => {
		try {
			const [settings, origins, wsCreds] = await Promise.all([
				apiValidated('/api/settings', settingsResponseSchema),
				api<OriginsResponse>(`/api/projects/${slug}/origins`),
				api<{ baseUrl: string; token: string | null }>('/api/sync/ws-credentials'),
			]);
			if (cancelled) return;
			if (settings.storageMode !== 'remote' || !settings.syncServerUrl) {
				hidden = true;
				return;
			}

			activeOriginId = origins.activeOriginId;
			clientId = origins.clientId;
			hidden = false;

			session = connectCoauthorSession({
				slug,
				credentials: {
					baseUrl: wsCreds.baseUrl,
					token: wsCreds.token ?? undefined,
				},
				deviceId: clientId,
				displayName: settings.deviceDisplayName || 'This device',
				originId: activeOriginId,
			});

			focusHandler = (path) => session?.setFocus(path);
			registerCoauthorFocusHandler(focusHandler);
		} catch {
			hidden = true;
		}
	})();

	window.addEventListener(COAUTHOR_PRESENCE_EVENT, onPresence);
	window.addEventListener(COAUTHOR_FILE_UPDATED_EVENT, onFileUpdated);

	return () => {
		cancelled = true;
		if (focusHandler) {
			unregisterCoauthorFocusHandler(focusHandler);
		}
		session?.close();
		window.removeEventListener(COAUTHOR_PRESENCE_EVENT, onPresence);
		window.removeEventListener(COAUTHOR_FILE_UPDATED_EVENT, onFileUpdated);
	};
});
</script>

{#if !hidden}
	<div class="coauthor-panel" data-transmut="include">
		<div class="panel-head">
			<span class="label">Live coauthors</span>
			<span class="count">{peers.length}</span>
		</div>

		{#if peers.length === 0}
			<p class="hint">No teammates connected right now.</p>
		{:else}
			<ul class="peer-list">
				{#each peers as peer (peer.deviceId)}
					<li>
						<span class="name" data-transmut-skip>{labelFor(peer)}</span>
						{#if peer.focusPath}
							<span class="focus" data-transmut-skip>editing {focusLabel(peer.focusPath)}</span>
						{:else}
							<span class="focus muted">browsing</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if remoteUpdate}
			<p class="remote-update">
				<span data-transmut-skip>
					<code>{remoteUpdate.path}</code> was updated on another thread.
				</span>
				<button
					type="button"
					class="btn-inline"
					disabled={reloading}
					onclick={() => reloadRemoteFile()}
				>
					{reloading ? 'Reloading…' : 'Reload'}
				</button>
				<button type="button" class="btn-inline" onclick={() => (remoteUpdate = null)}>Dismiss</button>
			</p>
		{/if}
	</div>
{/if}

<style>
	.coauthor-panel {
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
		margin-bottom: 0.45rem;
	}

	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.count {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.peer-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.peer-list li {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.82rem;
	}

	.name {
		font-weight: 600;
	}

	.focus {
		font-size: 0.75rem;
		color: var(--accent-dim);
	}

	.focus.muted {
		color: var(--text-muted);
	}

	.remote-update {
		margin: 0.6rem 0 0;
		padding: 0.55rem 0.65rem;
		font-size: 0.8rem;
		background: rgba(232, 184, 74, 0.12);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.btn-inline {
		margin-top: 0.35rem;
		margin-right: 0.35rem;
		border: 1px solid var(--border);
		background: var(--bg-hover);
		border-radius: var(--radius);
		padding: 0.15rem 0.5rem;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
</style>
