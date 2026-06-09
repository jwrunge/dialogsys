<script lang="ts">
import Fuse from 'fuse.js';
import { nanoid } from 'nanoid';
import { onMount, tick } from 'svelte';
import { api, apiValidated } from '../lib/api';
import { applyGameStatePatchWithMerge, isGameStatePath } from '../lib/client/apply-doc-patch';
import { gameStateFilePath, setCoauthorFocusPath } from '../lib/client/coauthor-focus';
import { DebouncedTask, SAVE_DEBOUNCE_MS } from '../lib/client/debouncedSave';
import { markClean, markDirty, notifySaveConflict } from '../lib/client/dirty-state';
import { savePatchWithRebase } from '../lib/client/patch-save';
import { isProjectReadOnly } from '../lib/client/project-access';
import { defaultValidValues } from '../lib/flow/branchState';
import { computeGameStatePatch } from '../lib/game-state/patch';
import { settingsResponseSchema } from '../lib/schema/api-responses';
import { COAUTHOR_GRAPH_PATCH_EVENT, type CoauthorGraphPatch } from '../lib/sync/realtime';
import {
	defaultUseValidValues,
	type GameStateFile,
	type GameStateProperty,
	type GameStatePropertyType,
	type GameStateValue,
	normalizeGameStateProperty,
} from '../lib/schema/gameState';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let properties = $state<GameStateProperty[]>([]);
let savedGameState = $state<GameStateFile>({ properties: [] });
let contentHash = $state('');
let clientId = $state('');
let applyingRemotePatch = $state(false);
let ready = $state(false);
let loadError = $state('');
let saveStatus = $state('');
let dialogEl = $state<HTMLDialogElement | null>(null);
let draft = $state<GameStateProperty | null>(null);
let editIndex = $state<number | null>(null);
let addingValue = $state(false);
let addValueDraft = $state('');
let addValueInput = $state<HTMLInputElement | null>(null);
let searchQuery = $state('');

type ListedProperty = { prop: GameStateProperty; index: number };

const listedProperties = $derived.by((): ListedProperty[] => {
	const q = searchQuery.trim();
	if (!q) {
		return properties.map((prop, index) => ({ prop, index }));
	}
	const fuse = new Fuse(properties, {
		keys: [
			{ name: 'label', weight: 0.5 },
			{ name: 'id', weight: 0.35 },
			{ name: 'description', weight: 0.15 },
		],
		threshold: 0.4,
		ignoreLocation: true,
	});
	return fuse.search(q).map((result) => ({
		prop: result.item,
		index: properties.findIndex((p) => p.id === result.item.id),
	}));
});

function cloneProperty(prop: GameStateProperty): GameStateProperty {
	return JSON.parse(JSON.stringify(prop)) as GameStateProperty;
}

function newProperty(): GameStateProperty {
	const id = `var_${nanoid(4)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')}`;
	const type: GameStatePropertyType = 'boolean';
	return {
		id,
		label: 'New state',
		type,
		useValidValues: true,
	};
}

function slugifyLabel(label: string): string {
	return (
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '')
			.slice(0, 32) || 'var'
	);
}

const saveTask = new DebouncedTask(SAVE_DEBOUNCE_MS, () => void save());

function scheduleSave() {
	if (isProjectReadOnly() || applyingRemotePatch) return;
	markDirty();
	saveTask.schedule();
}

async function save() {
	const next: GameStateFile = { properties };
	const ops = computeGameStatePatch(savedGameState, next);
	if (ops.length === 0) {
		markClean();
		if (saveStatus === 'Saving…') saveStatus = '';
		return;
	}
	saveStatus = 'Saving…';
	markDirty();
	try {
		const result = await savePatchWithRebase({
			url: `/api/projects/${slug}/game-state`,
			path: gameStateFilePath(),
			saved: savedGameState,
			next,
			contentHash,
			ops,
			computeOps: computeGameStatePatch,
			parseSuccess: (res) => ({ saved: res.gameState, contentHash: res.contentHash }),
			parseConflict: (body) => {
				const gameState = body.gameState as GameStateFile | undefined;
				const hash = body.currentContentHash;
				if (!gameState || typeof hash !== 'string') return null;
				return { saved: gameState, contentHash: hash };
			},
		});
		savedGameState = result.saved;
		properties = result.saved.properties;
		contentHash = result.contentHash;
		saveStatus = result.rebased ? 'Merged teammate edits and saved' : 'Saved';
		markClean();
		setTimeout(() => {
			if (saveStatus === 'Saved') saveStatus = '';
		}, 1500);
	} catch (e) {
		notifySaveConflict(e);
		saveStatus = (e as Error).message;
	}
}

async function applyRemotePatch(patch: CoauthorGraphPatch) {
	if (!isGameStatePath(patch.path)) return;
	if (patch.deviceId === clientId) return;
	if (applyingRemotePatch) return;

	applyingRemotePatch = true;
	try {
		const { value: next, staleBase } = applyGameStatePatchWithMerge(
			savedGameState,
			{ properties },
			patch,
			contentHash,
		);
		properties = next.properties;
		if (!staleBase) {
			savedGameState = next;
			contentHash = patch.contentHash;
		} else {
			saveStatus = `${patch.displayName || 'Teammate'} merged remote edits`;
		}
	} finally {
		applyingRemotePatch = false;
	}
}

async function load() {
	ready = false;
	loadError = '';
	try {
		const res = await api<GameStateFile & { contentHash: string }>(`/api/projects/${slug}/game-state`);
		properties = res.properties;
		savedGameState = { properties: res.properties };
		contentHash = res.contentHash;
		ready = true;
	} catch (e) {
		loadError = (e as Error).message;
		properties = [];
		savedGameState = { properties: [] };
		contentHash = '';
	}
}

async function openAdd() {
	resetAddValue();
	draft = newProperty();
	editIndex = null;
	await tick();
	dialogEl?.showModal();
}

async function openEdit(index: number) {
	resetAddValue();
	draft = normalizeGameStateProperty(cloneProperty(properties[index]!));
	editIndex = index;
	await tick();
	dialogEl?.showModal();
}

function closeModal() {
	dialogEl?.close();
	draft = null;
	editIndex = null;
	addingValue = false;
	addValueDraft = '';
}

function resetAddValue() {
	addingValue = false;
	addValueDraft = '';
}

function startAddValue(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (!draft) return;
	if (addingValue) {
		commitAddValue();
	}
	addingValue = true;
	addValueDraft = '';
}

$effect(() => {
	if (addingValue && addValueInput) {
		addValueInput.focus();
	}
});

function commitAddValue() {
	if (!draft || !addingValue) return;
	const raw = addValueInput?.value ?? addValueDraft;
	if (addValidValue(raw)) {
		resetAddValue();
	}
}

function onAddValueKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter') {
		e.preventDefault();
		commitAddValue();
	} else if (e.key === 'Escape') {
		e.preventDefault();
		resetAddValue();
	}
}

function applyDraft() {
	if (!draft) return;
	const next = normalizeGameStateProperty(cloneProperty(draft));
	if (editIndex === null) {
		properties = [...properties, next];
	} else {
		properties = properties.map((p, i) => (i === editIndex ? next : p));
	}
	closeModal();
	scheduleSave();
}

function removeProperty(index: number) {
	properties = properties.filter((_, i) => i !== index);
	scheduleSave();
}

function onTypeChange(type: GameStatePropertyType) {
	if (!draft) return;
	resetAddValue();
	const useValidValues = defaultUseValidValues(type);
	draft = {
		...draft,
		type,
		useValidValues,
		validValues: type === 'boolean' || !useValidValues ? undefined : (draft.validValues ?? []),
	};
}

function toggleUseValidValues(checked: boolean) {
	if (!draft) return;
	resetAddValue();
	draft = {
		...draft,
		useValidValues: checked,
		validValues: checked ? (draft.validValues ?? defaultValidValues(draft.type)) : undefined,
	};
}

function addValidValue(raw: string | number): boolean {
	if (!draft || !draft.useValidValues || draft.type === 'boolean') return false;
	let value: GameStateValue;
	if (draft.type === 'number') {
		const n = typeof raw === 'number' ? raw : Number(raw);
		if (raw === '' || Number.isNaN(n)) return false;
		value = n;
	} else {
		value = String(raw).trim();
		if (!value) return false;
	}
	const values = [...(draft.validValues ?? []), value];
	draft = { ...draft, validValues: values };
	return true;
}

function removeValidValue(index: number) {
	if (!draft?.validValues) return;
	draft = {
		...draft,
		validValues: draft.validValues.filter((_, i) => i !== index),
	};
}

function formatValidValue(value: GameStateValue): string {
	return typeof value === 'string' ? value : String(value);
}

function descriptionPreview(description?: string): string {
	const t = description?.trim() ?? '';
	if (!t) return 'No description';
	return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

function metaLabel(prop: GameStateProperty): string {
	const typeLabel = prop.type.charAt(0).toUpperCase() + prop.type.slice(1);
	if (prop.type === 'boolean') return typeLabel;
	if (prop.useValidValues === true && prop.validValues?.length) {
		const count = prop.validValues.length;
		return `${typeLabel} · ${count} value${count === 1 ? '' : 's'}`;
	}
	return `${typeLabel} · comparisons`;
}

onMount(() => {
	setCoauthorFocusPath('gameState.json');

	function onGraphPatch(e: Event) {
		const patch = (e as CustomEvent<CoauthorGraphPatch>).detail;
		void applyRemotePatch(patch);
	}

	window.addEventListener(COAUTHOR_GRAPH_PATCH_EVENT, onGraphPatch);

	void (async () => {
		try {
			const settings = await apiValidated('/api/settings', settingsResponseSchema);
			clientId = settings.clientId;
		} catch {
			clientId = '';
		}
		await load();
	})();

	return () => {
		window.removeEventListener(COAUTHOR_GRAPH_PATCH_EVENT, onGraphPatch);
		setCoauthorFocusPath(null);
	};
});
</script>

<div data-transmut="include">
<div class="toolbar">
	<input
		class="search"
		type="search"
		bind:value={searchQuery}
		placeholder="Search by name or description…"
		aria-label="Search state"
		disabled={!ready}
	/>
	{#if saveStatus}
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus}</span>
	{/if}
	<button type="button" class="btn btn-primary toolbar-add" onclick={openAdd} disabled={!ready}>
		Add State
	</button>
</div>

{#if loadError}
	<p class="error-banner">{loadError}</p>
{:else if !ready}
	<p class="muted">Loading state…</p>
{:else if properties.length === 0}
	<p class="muted">No state yet. Click <strong>Add State</strong> to create one.</p>
{:else if listedProperties.length === 0}
	<p class="muted">No state matches “{searchQuery.trim()}”.</p>
{:else}
	<div class="summary-list">
		{#each listedProperties as { prop, index } (prop.id)}
			<article class="summary-card">
				<div class="state-icon" title={prop.type}>
					<span class="state-icon-fallback">{prop.label.charAt(0).toUpperCase()}</span>
				</div>
				<div class="summary-body">
					<div class="summary-head">
						<div>
							<h3>{prop.label}</h3>
							<p class="id">{prop.id}</p>
						</div>
						<button type="button" class="btn" onclick={() => openEdit(index)}>Edit</button>
					</div>
					<p class="summary-desc">{descriptionPreview(prop.description)}</p>
					<p class="summary-meta">{metaLabel(prop)}</p>
				</div>
			</article>
		{/each}
	</div>
{/if}

<dialog bind:this={dialogEl} class="modal" onclose={closeModal}>
	{#if draft}
		<form
			class="modal-panel"
			onsubmit={(e) => {
				e.preventDefault();
				applyDraft();
			}}
		>
			<header class="modal-header">
				<h2>{editIndex === null ? 'Add state' : 'Edit state'}</h2>
			</header>
			<div class="modal-body">
				<div class="field">
					<label for="prop-label">Label</label>
					<input
						id="prop-label"
						bind:value={draft.label}
						required
						oninput={() => {
							if (editIndex !== null) return;
							if (draft!.id === 'var_' || draft!.id.startsWith('var_')) {
								draft = { ...draft!, id: slugifyLabel(draft!.label) };
							}
						}}
					/>
				</div>
				<div class="field">
					<label for="prop-id">ID</label>
					<input
						id="prop-id"
						bind:value={draft.id}
						required
						pattern="[a-z][a-z0-9_]*"
					/>
				</div>
				<div class="field">
					<label for="prop-type">Type</label>
					<select
						id="prop-type"
						value={draft.type}
						onchange={(e) => onTypeChange((e.currentTarget as HTMLSelectElement).value as GameStatePropertyType)}
					>
						<option value="boolean">Boolean</option>
						<option value="number">Number</option>
						<option value="string">String</option>
					</select>
				</div>
				{#if draft.type !== 'boolean'}
					<div class="field checkbox-field">
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={draft.useValidValues === true}
								onchange={(e) =>
									toggleUseValidValues((e.currentTarget as HTMLInputElement).checked)}
							/>
							Set valid values
						</label>
						<p class="field-hint">
							When enabled, flow branches can use each value as a path. Disable for free-form
							comparisons (numbers, strings).
						</p>
					</div>
					{#if draft.useValidValues === true}
						<div class="field">
							<span class="field-label">Valid values</span>
							<div class="value-list">
								{#each draft.validValues ?? [] as value, vi (vi)}
									<div class="value-row">
										<span class="value-text">{formatValidValue(value)}</span>
										<button
											type="button"
											class="remove-btn"
											aria-label="Remove {formatValidValue(value)}"
											onclick={() => removeValidValue(vi)}
										>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M6 6l12 12M18 6L6 18"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
												/>
											</svg>
										</button>
									</div>
								{/each}
								{#if addingValue}
									<div class="value-row add-input-row">
										{#if draft.type === 'number'}
											<input
												bind:this={addValueInput}
												class="value-input"
												type="number"
												placeholder="Value"
												value={addValueDraft}
												oninput={(e) => {
													addValueDraft = (e.currentTarget as HTMLInputElement).value;
												}}
												onkeydown={onAddValueKeydown}
											/>
										{:else}
											<input
												bind:this={addValueInput}
												class="value-input"
												type="text"
												placeholder="Value"
												value={addValueDraft}
												oninput={(e) => {
													addValueDraft = (e.currentTarget as HTMLInputElement).value;
												}}
												onkeydown={onAddValueKeydown}
											/>
										{/if}
										<div class="add-input-actions">
											<button
												type="button"
												class="confirm-add-btn"
												aria-label="Add value"
												onclick={commitAddValue}
											>
												Add
											</button>
											<button
												type="button"
												class="remove-btn"
												aria-label="Cancel"
												onclick={resetAddValue}
											>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
													<path
														d="M6 6l12 12M18 6L6 18"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
													/>
												</svg>
											</button>
										</div>
									</div>
								{/if}
								<button
									type="button"
									class="value-row add-value-btn"
									onclick={startAddValue}
								>
									Add value
								</button>
							</div>
						</div>
					{/if}
				{/if}
				<div class="field">
					<label for="prop-desc">Description (optional)</label>
					<textarea id="prop-desc" bind:value={draft.description} rows="2"></textarea>
				</div>
			</div>
			<footer class="modal-footer">
				{#if editIndex !== null}
					<button
						type="button"
						class="btn btn-danger"
						onclick={() => {
							removeProperty(editIndex!);
							closeModal();
						}}
					>
						Remove
					</button>
				{/if}
				<div class="modal-footer-right">
					<button type="button" class="btn" onclick={closeModal}>Cancel</button>
					<button type="submit" class="btn btn-primary">Done</button>
				</div>
			</footer>
		</form>
	{/if}
</dialog>
</div>

<style>
	.toolbar {
		background: transparent;
		border-bottom: none;
		padding: 0 0 1rem;
	}

	.toolbar .search {
		flex: 1;
		min-width: 180px;
		max-width: 420px;
	}

	.toolbar-add {
		margin-left: auto;
		flex-shrink: 0;
	}

	.summary-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.summary-card {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		padding: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.summary-body {
		flex: 1;
		min-width: 0;
	}

	.state-icon {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		border-radius: 10px;
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.state-icon-fallback {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.summary-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.summary-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.id {
		margin: 0.15rem 0 0;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.summary-desc,
	.summary-meta {
		margin: 0.35rem 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.error-banner {
		padding: 1rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}

	.modal {
		border: none;
		padding: 0;
		margin: auto;
		position: fixed;
		inset: 0;
		width: min(480px, calc(100vw - 2rem));
		height: fit-content;
		max-height: calc(100vh - 2rem);
		background: transparent;
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.modal-panel {
		margin: 0;
		padding: 0;
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		max-height: calc(100vh - 3rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		color: var(--text);
	}

	.modal-panel label {
		color: var(--text);
	}

	.modal-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.modal-body {
		flex: 1;
		min-height: 0;
		padding: 1.25rem;
		overflow-y: auto;
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
		background: var(--bg-elevated);
	}

	.modal-footer-right {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.checkbox-field {
		margin-top: 0.25rem;
	}

	.checkbox-label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		width: fit-content;
		margin-bottom: 0;
		color: var(--text);
		font-size: 0.9rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
		flex-shrink: 0;
		margin: 0;
		padding: 0;
	}

	.field-hint {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.field-label {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
		color: var(--text-muted);
	}

	.value-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}

	.value-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		min-height: 2.5rem;
		padding: 0.5rem 0.75rem;
		border: none;
		border-bottom: 1px solid var(--border);
		background: transparent;
		box-sizing: border-box;
	}

	.value-list > :last-child {
		border-bottom: none;
	}

	.value-text {
		font-family: var(--mono);
		font-size: 0.9rem;
		color: var(--text);
	}

	.remove-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.remove-btn:hover {
		background: var(--bg-hover);
		color: var(--error);
	}

	.add-input-row {
		padding-top: 0.35rem;
		padding-bottom: 0.35rem;
	}

	.add-input-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.confirm-add-btn {
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--accent-dim);
		border-radius: var(--radius);
		background: var(--accent-dim);
		color: #fff;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.confirm-add-btn:hover {
		background: var(--accent);
		border-color: var(--accent);
	}

	.value-input {
		width: 100%;
		padding: 0.35rem 0;
		border: none;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-family: var(--mono);
		font-size: 0.9rem;
	}

	.value-input:focus {
		outline: none;
	}

	.add-value-btn {
		justify-content: flex-start;
		color: var(--accent);
		font: inherit;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		pointer-events: auto;
	}

	.add-value-btn:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
</style>
