<script lang="ts">
import { onMount } from 'svelte';
import { api, apiValidated } from '../lib/api';
import {
	clearSyncTokenFromKeychain,
	isTauriRuntime,
	saveSyncTokenToKeychain,
} from '../lib/client/tauri-secrets';
import { dispatchLocaleChange } from '../lib/i18n/events';
import { getLocaleOption } from '../lib/i18n/locales';
import {
	type SettingsResponse,
	settingsResponseSchema,
	syncTestResponseSchema,
} from '../lib/schema/api-responses';
import { testSyncConnection } from '../lib/sync/client';
import LanguagePickerModal from './LanguagePickerModal.svelte';
import PairingCard from './PairingCard.svelte';

let projectsRoot = $state('./projects');
let clientId = $state('');
let storageMode = $state<StorageMode>('local');
let syncServerUrl = $state('');
let hasSyncServerToken = $state(false);
let syncServerTokenInput = $state('');
let clearSyncServerToken = $state(false);
let resolvedPath = $state('');
let source = $state<SettingsResponse['source']>('default');
let envOverride = $state(false);
let configFile = $state<string | null>(null);
let ready = $state(false);
let saving = $state(false);
let testing = $state(false);
let error = $state('');
let saved = $state(false);
let connectionStatus = $state<'idle' | 'ok' | 'error'>('idle');
let connectionMessage = $state('');
let connectionProjectCount = $state(0);
let locale = $state('en');
let deviceDisplayName = $state('');
let syncAccessRole = $state<'read' | 'write'>('write');
let languagePickerOpen = $state(false);

const selectedLocale = $derived(getLocaleOption(locale));

async function load() {
	ready = false;
	error = '';
	try {
		const res = await apiValidated('/api/settings', settingsResponseSchema);
		projectsRoot = res.projectsRoot;
		storageMode = res.storageMode ?? 'local';
		syncServerUrl = res.syncServerUrl ?? '';
		hasSyncServerToken = res.hasSyncServerToken ?? false;
		syncServerTokenInput = '';
		clearSyncServerToken = false;
		clientId = res.clientId ?? '';
		resolvedPath = res.resolvedPath;
		source = res.source;
		envOverride = res.envOverride;
		configFile = res.configFile;
		locale = res.locale ?? 'en';
		deviceDisplayName = res.deviceDisplayName ?? '';
		syncAccessRole = res.syncAccessRole ?? 'write';
		ready = true;
	} catch (e) {
		error = (e as Error).message;
	}
}

async function testConnection() {
	if (!syncServerUrl.trim()) {
		connectionStatus = 'error';
		connectionMessage = 'Enter a sync server URL first.';
		return;
	}
	testing = true;
	connectionStatus = 'idle';
	connectionMessage = '';
	try {
		const tokenForTest = syncServerTokenInput.trim() || undefined;
		const browserResult = await testSyncConnection({
			baseUrl: syncServerUrl.trim(),
			token: tokenForTest,
		});
		if (browserResult.ok) {
			connectionStatus = 'ok';
			connectionProjectCount = browserResult.projectCount;
			connectionMessage = `Connected — ${browserResult.projectCount} project${browserResult.projectCount === 1 ? '' : 's'} found.`;
			return;
		}

		const serverResult = await apiValidated('/api/settings', syncTestResponseSchema, {
			method: 'POST',
			body: JSON.stringify({
				syncServerUrl: syncServerUrl.trim(),
				syncServerToken: tokenForTest,
			}),
		});
		if (serverResult.ok) {
			connectionStatus = 'ok';
			connectionProjectCount = serverResult.projectCount;
			connectionMessage = `Connected via app server — ${serverResult.projectCount} project${serverResult.projectCount === 1 ? '' : 's'} found.`;
		} else {
			connectionStatus = 'error';
			connectionMessage = browserResult.error ?? 'Connection failed';
		}
	} catch (e) {
		connectionStatus = 'error';
		connectionMessage = (e as Error).message;
	} finally {
		testing = false;
	}
}

async function save(e: Event) {
	e.preventDefault();
	if (saving || envOverride) return;
	error = '';
	saved = false;
	saving = true;
	try {
		const payload: Record<string, string> = {
			projectsRoot: projectsRoot.trim(),
			storageMode,
			syncServerUrl: syncServerUrl.trim(),
			locale,
			deviceDisplayName: deviceDisplayName.trim(),
		};

		const tauri = await isTauriRuntime();
		if (tauri) {
			if (clearSyncServerToken) await clearSyncTokenFromKeychain();
			else if (syncServerTokenInput.trim()) {
				await saveSyncTokenToKeychain(syncServerTokenInput.trim());
			}
		} else if (clearSyncServerToken) {
			payload.syncServerToken = '';
		} else if (syncServerTokenInput.trim()) {
			payload.syncServerToken = syncServerTokenInput.trim();
		}

		const res = await apiValidated('/api/settings', settingsResponseSchema, {
			method: 'PUT',
			body: JSON.stringify(payload),
		});
		projectsRoot = res.projectsRoot;
		storageMode = res.storageMode ?? 'local';
		syncServerUrl = res.syncServerUrl ?? '';
		hasSyncServerToken = res.hasSyncServerToken ?? false;
		syncServerTokenInput = '';
		clearSyncServerToken = false;
		clientId = res.clientId ?? '';
		resolvedPath = res.resolvedPath;
		source = res.source;
		configFile = res.configFile;
		locale = res.locale ?? locale;
		deviceDisplayName = res.deviceDisplayName ?? deviceDisplayName;
		syncAccessRole = res.syncAccessRole ?? syncAccessRole;
		dispatchLocaleChange(locale);
		saved = true;
	} catch (e) {
		error = (e as Error).message;
	} finally {
		saving = false;
	}
}

onMount(load);
</script>

<div data-transmut="include">
{#if !ready && !error}
	<p class="muted">Loading settings…</p>
{:else}
	<form class="settings-form" onsubmit={save}>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		{#if saved}
			<p class="success">Settings saved.</p>
		{/if}

		<section class="settings-section">
			<h2>Language</h2>
			<p class="hint">
				Interface language for app menus and labels. Project content (dialogue, names, notes) is not translated.
			</p>
			<div class="field">
				<span class="field-label" id="locale-label">Language</span>
				<div class="locale-picker-row">
					<button
						type="button"
						class="locale-picker-trigger"
						aria-labelledby="locale-label"
						disabled={envOverride}
						onclick={() => {
							languagePickerOpen = true;
						}}
					>
						<span class="locale-native" data-transmut-skip
							>{selectedLocale?.nativeName ?? locale}</span
						>
						{#if selectedLocale && selectedLocale.englishName !== selectedLocale.nativeName}
							<span class="locale-english" data-transmut-skip>{selectedLocale.englishName}</span>
						{/if}
					</button>
					<button
						type="button"
						class="btn"
						disabled={envOverride}
						onclick={() => {
							languagePickerOpen = true;
						}}
					>
						Change
					</button>
				</div>
				<LanguagePickerModal
					open={languagePickerOpen}
					selectedTag={locale}
					disabled={envOverride}
					onselect={(tag) => {
						locale = tag;
					}}
					onclose={() => {
						languagePickerOpen = false;
					}}
				/>
			</div>
		</section>

		<section class="settings-section">
			<h2>Project storage</h2>
			<p class="hint">
				Local mode stores projects on this machine. Remote mode reads and writes through your sync server; each device keeps its own version thread.
			</p>

			<div class="mode-toggle" role="radiogroup" aria-label="Storage mode">
				<label class="mode-option">
					<input
						type="radio"
						name="storage-mode"
						value="local"
						bind:group={storageMode}
						disabled={envOverride}
					/>
					<span>
						<strong>Local folder</strong>
						<span class="mode-desc">Projects on this computer</span>
					</span>
				</label>
				<label class="mode-option">
					<input
						type="radio"
						name="storage-mode"
						value="remote"
						bind:group={storageMode}
						disabled={envOverride}
					/>
					<span>
						<strong>Remote sync server</strong>
						<span class="mode-desc">Self-hosted Dialogsys Server</span>
					</span>
				</label>
			</div>
		</section>

		{#if storageMode === 'local'}
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
					<span>Relative paths resolve from the app directory. Each project is a subfolder with</span><code data-transmut-skip>project.json</code><span>, scenes, sequences, and more.</span>
				</p>
			</div>

			{#if resolvedPath}
				<div class="info-card">
				<p>
					<strong>Current location:</strong>
					<code data-transmut-skip>{resolvedPath}</code>
				</p>
				<p class="hint">
					{#if source === 'env'}
						Active source: Environment variable (DIALOGSYS_PROJECTS_ROOT)
					{:else if source === 'config'}
						Active source: Settings file
					{:else}
						Active source: Default
					{/if}
				</p>
				{#if configFile}
					<p class="hint">
						<span>Saved in</span> <code data-transmut-skip>{configFile}</code>
					</p>
					{/if}
				</div>
			{/if}
		{:else}
			{#if syncAccessRole === 'read'}
				<p class="warning">Connected with a read-only token. Saving is disabled.</p>
			{/if}

			<div class="field">
				<label for="device-display-name">This device name</label>
				<input
					id="device-display-name"
					bind:value={deviceDisplayName}
					maxlength="64"
					placeholder="Jake's MacBook"
					disabled={envOverride}
				/>
				<p class="hint">Shown in Working thread for you and teammates.</p>
			</div>

			<div class="field">
				<label for="sync-server-url">Sync server URL</label>
				<input
					id="sync-server-url"
					bind:value={syncServerUrl}
					required
					autocomplete="off"
					placeholder="http://127.0.0.1:3210"
					disabled={envOverride}
				/>
				<p class="hint">
					Base URL of your self-hosted server from <code data-transmut-skip>sync-server/</code>. Use HTTPS behind a reverse proxy when accessing from other devices.
				</p>
			</div>

			<div class="field">
				<label for="sync-server-token">Access token</label>
				<input
					id="sync-server-token"
					type="password"
					bind:value={syncServerTokenInput}
					autocomplete="off"
					placeholder={hasSyncServerToken ? 'Saved — enter to replace' : 'Bearer token from server config'}
					disabled={envOverride}
				/>
				<p class="hint">
					<span>Must match</span> <code data-transmut-skip>authToken</code> <span>in the server config. Leave blank to keep the saved token. Generate one with</span> <code data-transmut-skip>openssl rand -hex 32</code><span>.</span>
				</p>
				{#if hasSyncServerToken}
					<label class="clear-token">
						<input type="checkbox" bind:checked={clearSyncServerToken} disabled={envOverride} />
						Remove saved access token
					</label>
				{/if}
			</div>

			<div class="test-row">
				<button
					type="button"
					class="btn"
					onclick={testConnection}
					disabled={testing || envOverride || !syncServerUrl.trim()}
				>
					{testing ? 'Testing…' : 'Test connection'}
				</button>
				{#if connectionStatus === 'ok'}
					<span class="status-ok" data-transmut-skip>{connectionMessage}</span>
				{:else if connectionStatus === 'error'}
					<span class="status-error" data-transmut-skip>{connectionMessage}</span>
				{/if}
			</div>

			<div class="info-card">
				<p class="hint">
					Local dev:
					<code>cd sync-server && cargo run -- --root ./projects --bind 127.0.0.1:3210</code>
				</p>
				<p class="hint">
					Remote/LAN access requires a token, e.g.
					<code>cargo run -- --bind 0.0.0.0:3210 --auth-token "$(openssl rand -hex 32)"</code>
				</p>
			</div>
		{/if}

		{#if envOverride}
			<p class="warning">
				The local folder path is overridden because <code data-transmut-skip>DIALOGSYS_PROJECTS_ROOT</code> is set in the environment. Remove that variable to control it from here.
			</p>
		{/if}

		{#if clientId}
			<div class="info-card">
				<p class="hint">
					<strong>This device ID:</strong> <code data-transmut-skip>{clientId}</code>
				</p>
			</div>
		{/if}

		{#if storageMode === 'remote'}
			<PairingCard {syncServerUrl} hasToken={hasSyncServerToken} {clientId} />
		{/if}

		<div class="actions">
			<a class="btn" href="/">← Projects</a>
			<button type="submit" class="btn btn-primary" disabled={saving || envOverride}>
				{saving ? 'Saving…' : 'Save'}
			</button>
		</div>
	</form>
{/if}
</div>

<style>
	.settings-form {
		max-width: 40rem;
	}

	.settings-section {
		margin-bottom: 1.5rem;
	}

	.settings-section h2 {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
	}

	.mode-toggle {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.mode-option {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		cursor: pointer;
	}

	.mode-option:has(input:checked) {
		border-color: var(--accent-dim);
		background: var(--bg-hover);
	}

	.mode-option input {
		width: auto;
		margin-top: 0.2rem;
	}

	.mode-option strong {
		display: block;
		font-size: 0.95rem;
	}

	.mode-desc {
		display: block;
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.field {
		margin-bottom: 1.25rem;
	}

	.field-label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.locale-picker-row {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: 0.5rem;
	}

	.locale-picker-trigger {
		flex: 1;
		min-width: 12rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.55rem 0.75rem;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color-scheme: dark;
		color: var(--text);
		font: inherit;
		appearance: none;
		cursor: pointer;
	}

	.locale-picker-trigger:hover:not(:disabled) {
		border-color: var(--accent-dim);
		background: var(--bg-hover);
	}

	.locale-picker-trigger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.locale-native {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--text);
	}

	.locale-english {
		font-size: 0.8rem;
		color: var(--text-muted);
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

	.clear-token {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.clear-token input {
		width: auto;
	}

	.test-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.status-ok {
		color: var(--success);
		font-size: 0.85rem;
	}

	.status-error {
		color: var(--error);
		font-size: 0.85rem;
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
