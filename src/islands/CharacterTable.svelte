<script lang="ts">
import Fuse from 'fuse.js';
import { nanoid } from 'nanoid';
import { onMount, tick } from 'svelte';
import { api } from '../lib/api';
import { defaultPortraitPath, portraitPreviewUrl } from '../lib/characters';
import { uploadPortrait } from '../lib/client/download';
import type { Character, CharacterState, CharactersFile } from '../lib/schema/characters';

interface Props {
	slug: string;
}

let { slug }: Props = $props();

let characters = $state<Character[]>([]);
let ready = $state(false);
let loadError = $state('');
let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
let saveMessage = $state('');
let searchQuery = $state('');

let characterDialogEl = $state<HTMLDialogElement | null>(null);

let characterDraft = $state<Character | null>(null);
let characterEditIndex = $state<number | null>(null);

let stateDraft = $state<CharacterState | null>(null);
let stateEditIndex = $state<number | null>(null);
let portraitUploading = $state(false);
let portraitUploadError = $state('');

function cloneCharacter(char: Character): Character {
	return JSON.parse(JSON.stringify(char)) as Character;
}

function cloneState(state: CharacterState): CharacterState {
	return JSON.parse(JSON.stringify(state)) as CharacterState;
}

function newCharacter(): Character {
	const id = `char_${nanoid(6)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')}`;
	return {
		id,
		displayName: 'New Character',
		bio: '',
		portraitPath: '',
		tags: [],
		voiceNotes: '',
		defaultStateId: 'default',
		states: [
			{
				id: 'default',
				label: 'Default',
				portraitPath: '',
			},
		],
	};
}

function newState(): CharacterState {
	return {
		id: `state_${nanoid(4)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')}`,
		label: 'New State',
		portraitPath: '',
	};
}

function slugifyLabel(label: string): string {
	return (
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '')
			.slice(0, 32) || 'state'
	);
}

function defaultStateLabel(char: Character): string {
	return char.states.find((s) => s.id === char.defaultStateId)?.label ?? char.defaultStateId;
}

function bioPreview(bio: string): string {
	const t = bio.trim();
	if (!t) return 'No bio';
	return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

type ListedCharacter = { char: Character; index: number };

const listedCharacters = $derived.by((): ListedCharacter[] => {
	const q = searchQuery.trim();
	if (!q) {
		return characters.map((char, index) => ({ char, index }));
	}
	const fuse = new Fuse(characters, {
		keys: [
			{ name: 'displayName', weight: 0.5 },
			{ name: 'id', weight: 0.3 },
			{ name: 'tags', weight: 0.2 },
		],
		threshold: 0.4,
		ignoreLocation: true,
	});
	return fuse.search(q).map((result) => ({
		char: result.item,
		index: characters.findIndex((c) => c.id === result.item.id),
	}));
});

async function load() {
	ready = false;
	loadError = '';
	try {
		const data = await api<CharactersFile>(`/api/projects/${slug}/characters`);
		characters = Array.isArray(data.characters) ? data.characters : [];
		ready = true;
	} catch (e) {
		loadError = (e as Error).message;
		characters = [];
	}
}

async function persistCharacters() {
	saveStatus = 'saving';
	saveMessage = 'Saving…';
	try {
		await api(`/api/projects/${slug}/characters`, {
			method: 'PUT',
			body: JSON.stringify({ characters }),
		});
		saveStatus = 'saved';
		saveMessage = 'Saved';
		setTimeout(() => {
			if (saveStatus === 'saved') {
				saveStatus = 'idle';
				saveMessage = '';
			}
		}, 2000);
	} catch (e) {
		saveStatus = 'error';
		saveMessage = (e as Error).message;
	}
}

async function openAddCharacter() {
	characterDraft = newCharacter();
	characterEditIndex = null;
	await tick();
	characterDialogEl?.showModal();
}

async function openEditCharacter(index: number) {
	characterDraft = cloneCharacter(characters[index]);
	characterEditIndex = index;
	await tick();
	characterDialogEl?.showModal();
}

function closeCharacterModal() {
	closeStateModal();
	characterDialogEl?.close();
	characterDraft = null;
	characterEditIndex = null;
}

async function applyCharacterDraft() {
	if (!characterDraft || saveStatus === 'saving') return;
	const draft = cloneCharacter(characterDraft);
	if (characterEditIndex === null) {
		characters = [...characters, draft];
	} else {
		characters = characters.map((c, i) => (i === characterEditIndex ? draft : c));
	}
	closeCharacterModal();
	await persistCharacters();
}

async function removeCharacterFromModal() {
	if (characterEditIndex === null) {
		closeCharacterModal();
		return;
	}
	if (!confirm(`Remove character "${characterDraft?.displayName}"?`)) return;
	characters = characters.filter((_, i) => i !== characterEditIndex);
	closeCharacterModal();
	await persistCharacters();
}

function openAddState() {
	if (!characterDraft) return;
	stateDraft = newState();
	stateEditIndex = null;
}

function openEditState(index: number) {
	if (!characterDraft) return;
	stateDraft = cloneState(characterDraft.states[index]);
	stateEditIndex = index;
}

function closeStateModal() {
	stateDraft = null;
	stateEditIndex = null;
	portraitUploadError = '';
}

async function onPortraitSelected(e: Event) {
	const input = e.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	if (!file || !characterDraft || !stateDraft || portraitUploading) return;

	portraitUploading = true;
	portraitUploadError = '';
	try {
		const path = await uploadPortrait(slug, characterDraft.id, stateDraft.id, file);
		stateDraft = { ...stateDraft, portraitPath: path };
	} catch (err) {
		portraitUploadError = (err as Error).message;
	} finally {
		portraitUploading = false;
	}
}

function applyStateDraft() {
	if (!characterDraft || !stateDraft) return;
	const draft = cloneState(stateDraft);
	if (stateEditIndex === null) {
		characterDraft = {
			...characterDraft,
			states: [...characterDraft.states, draft],
		};
	} else {
		characterDraft = {
			...characterDraft,
			states: characterDraft.states.map((s, i) => (i === stateEditIndex ? draft : s)),
		};
	}
	if (!characterDraft.states.some((s) => s.id === characterDraft!.defaultStateId)) {
		characterDraft = { ...characterDraft, defaultStateId: characterDraft.states[0]!.id };
	}
	closeStateModal();
}

function removeStateFromModal() {
	if (!characterDraft || stateEditIndex === null || !stateDraft) return;
	if (stateDraft.id === characterDraft.defaultStateId) return;
	characterDraft = {
		...characterDraft,
		states: characterDraft.states.filter((_, i) => i !== stateEditIndex),
	};
	closeStateModal();
}

function onStateLabelBlur() {
	if (!stateDraft) return;
	if (stateDraft.id === 'default' || stateDraft.id.startsWith('state_')) {
		const next = slugifyLabel(stateDraft.label);
		if (!next) return;
		const taken = characterDraft?.states.some((s, i) => s.id === next && i !== stateEditIndex);
		if (!taken) {
			const wasDefault = characterDraft?.defaultStateId === stateDraft.id;
			stateDraft = { ...stateDraft, id: next };
			if (wasDefault && characterDraft) {
				characterDraft = { ...characterDraft, defaultStateId: next };
			}
		}
	}
}

onMount(load);
</script>

<div class="toolbar">
	<input
		class="search"
		type="search"
		bind:value={searchQuery}
		placeholder="Search by name or tags…"
		aria-label="Search characters"
		disabled={!ready}
	/>
	{#if saveMessage}
		<span
			class="status"
			class:saved={saveStatus === 'saved'}
			class:error={saveStatus === 'error'}
		>
			{saveMessage}
		</span>
	{/if}
	<button type="button" class="btn btn-primary toolbar-add" onclick={openAddCharacter} disabled={!ready}>
		Add character
	</button>
</div>

{#if loadError}
	<p class="error-banner">{loadError}</p>
{:else if !ready}
	<p class="muted">Loading characters…</p>
{:else if characters.length === 0}
	<p class="muted">No characters yet. Click <strong>Add character</strong> to create one.</p>
{:else if listedCharacters.length === 0}
	<p class="muted">No characters match “{searchQuery.trim()}”.</p>
{:else}
	<div class="summary-list">
		{#each listedCharacters as { char, index } (char.id)}
			{@const portrait = portraitPreviewUrl(slug, defaultPortraitPath(char))}
			<article class="summary-card">
				<div class="portrait" title={defaultPortraitPath(char) || 'No portrait'}>
					{#if portrait}
						<img src={portrait} alt="" />
					{:else}
						<span class="portrait-fallback">{char.displayName.charAt(0).toUpperCase()}</span>
					{/if}
				</div>
				<div class="summary-body">
					<div class="summary-head">
						<div>
							<h3>{char.displayName}</h3>
							<p class="id">{char.id}</p>
						</div>
						<button type="button" class="btn" onclick={() => openEditCharacter(index)}>
							Edit
						</button>
					</div>
					<p class="summary-bio">{bioPreview(char.bio)}</p>
					<p class="summary-meta">
						{char.states.length} state{char.states.length === 1 ? '' : 's'} · default:
						{defaultStateLabel(char)}
					</p>
					{#if char.tags.length > 0}
						<div class="tag-row">
							{#each char.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}
				</div>
			</article>
		{/each}
	</div>
{/if}

<dialog bind:this={characterDialogEl} class="modal" onclose={closeCharacterModal}>
	{#if characterDraft}
		<form
			method="dialog"
			class="modal-panel"
			onsubmit={(e) => {
				e.preventDefault();
				applyCharacterDraft();
			}}
		>
			<header class="modal-header">
				<h2>{characterEditIndex === null ? 'Add character' : 'Edit character'}</h2>
			</header>

			<div class="modal-body">
				<div class="field">
					<label for="char-id">ID</label>
					<input id="char-id" bind:value={characterDraft.id} required pattern="[a-z][a-z0-9_]*" />
				</div>
				<div class="field">
					<label for="char-name">Display name</label>
					<input id="char-name" bind:value={characterDraft.displayName} required />
				</div>
				<div class="field">
					<label for="char-bio">Bio</label>
					<textarea id="char-bio" bind:value={characterDraft.bio} rows="3"></textarea>
				</div>
				<div class="field">
					<label for="char-tags">Tags (comma-separated)</label>
					<input
						id="char-tags"
						value={characterDraft.tags.join(', ')}
						oninput={(e) => {
							characterDraft = {
								...characterDraft!,
								tags: (e.currentTarget as HTMLInputElement).value
									.split(',')
									.map((t) => t.trim())
									.filter(Boolean),
							};
						}}
					/>
				</div>
				<div class="field">
					<label for="char-voice">Voice / style notes</label>
					<textarea id="char-voice" bind:value={characterDraft.voiceNotes} rows="2"></textarea>
				</div>

				<section class="states-block">
					<div class="states-block-head">
						<h3>Display states</h3>
						<button type="button" class="btn" onclick={openAddState}>Add state</button>
					</div>
					<div class="field">
						<label for="char-default-state">Default state</label>
						<select
							id="char-default-state"
							bind:value={characterDraft.defaultStateId}
							onchange={() => {
								characterDraft = { ...characterDraft! };
							}}
						>
							{#each characterDraft.states as st}
								<option value={st.id}>{st.label} ({st.id})</option>
							{/each}
						</select>
					</div>
					<div class="state-summary-list">
						{#each characterDraft.states as state, si (state.id)}
							{@const statePortrait = portraitPreviewUrl(slug, state.portraitPath)}
							<article class="state-summary-card">
								<div class="portrait portrait-sm" title={state.portraitPath || 'No portrait'}>
									{#if statePortrait}
										<img src={statePortrait} alt="" />
									{:else}
										<span class="portrait-fallback">{state.label.charAt(0).toUpperCase()}</span>
									{/if}
								</div>
								<div class="state-summary-body">
									<strong>{state.label}</strong>
									<span class="id">{state.id}</span>
									{#if state.id === characterDraft.defaultStateId}
										<span class="badge-default">default</span>
									{/if}
									{#if state.portraitPath && !statePortrait}
										<p class="portrait-hint">{state.portraitPath}</p>
									{/if}
								</div>
								<button type="button" class="btn" onclick={() => openEditState(si)}>
									Edit
								</button>
							</article>
						{/each}
					</div>
				</section>
			</div>

			<footer class="modal-footer">
				{#if characterEditIndex !== null}
					<button type="button" class="btn btn-danger" onclick={removeCharacterFromModal}>
						Remove character
					</button>
				{/if}
				<div class="modal-footer-right">
					<button
						type="button"
						class="btn"
						onclick={closeCharacterModal}
						disabled={saveStatus === 'saving'}>Cancel</button
					>
					<button type="submit" class="btn btn-primary" disabled={saveStatus === 'saving'}>
						{saveStatus === 'saving' ? 'Saving…' : 'Done'}
					</button>
				</div>
			</footer>

			{#if stateDraft}
				<div class="state-overlay" role="dialog" aria-modal="true">
					<button
						type="button"
						class="state-overlay-dismiss"
						onclick={closeStateModal}
						aria-label="Dismiss"
					></button>
					<div class="modal-panel modal-panel-sm state-overlay-panel">
						<header class="modal-header">
							<h2>{stateEditIndex === null ? 'Add state' : 'Edit state'}</h2>
						</header>

						<div class="modal-body">
							<div class="field">
								<label for="state-label">Label</label>
								<input
									id="state-label"
									bind:value={stateDraft.label}
									required
									onblur={onStateLabelBlur}
								/>
							</div>
							<div class="field">
								<label for="state-id">State id</label>
								<input
									id="state-id"
									bind:value={stateDraft.id}
									required
									pattern="[a-z][a-z0-9_]*"
									onchange={() => {
										stateDraft = { ...stateDraft! };
									}}
								/>
							</div>
							<div class="field portrait-field">
								<label for="state-portrait-file">Portrait</label>
								<div class="portrait-upload-row">
									<div class="portrait portrait-sm" title={stateDraft.portraitPath || 'No portrait'}>
										{#if portraitPreviewUrl(slug, stateDraft.portraitPath)}
											<img src={portraitPreviewUrl(slug, stateDraft.portraitPath)!} alt="" />
										{:else}
											<span class="portrait-fallback">{stateDraft.label.charAt(0).toUpperCase()}</span>
										{/if}
									</div>
									<div class="portrait-upload-controls">
										<input
											id="state-portrait-file"
											type="file"
											accept="image/png,image/jpeg,image/webp,image/gif"
											disabled={portraitUploading}
											onchange={onPortraitSelected}
										/>
										{#if portraitUploading}
											<p class="portrait-hint">Uploading…</p>
										{:else if stateDraft.portraitPath}
											<p class="portrait-hint"><code>{stateDraft.portraitPath}</code></p>
										{:else}
											<p class="portrait-hint">Upload PNG, JPEG, WebP, or GIF (max 5 MB)</p>
										{/if}
										{#if portraitUploadError}
											<p class="error">{portraitUploadError}</p>
										{/if}
									</div>
								</div>
								<label class="sr-only" for="state-portrait-url">Portrait URL override</label>
								<input
									id="state-portrait-url"
									bind:value={stateDraft.portraitPath}
									placeholder="Or paste https://… URL"
								/>
							</div>
						</div>

						<footer class="modal-footer">
							{#if stateEditIndex !== null && stateDraft.id !== characterDraft.defaultStateId}
								<button type="button" class="btn btn-danger" onclick={removeStateFromModal}>
									Remove state
								</button>
							{/if}
							<div class="modal-footer-right">
								<button type="button" class="btn" onclick={closeStateModal}>Cancel</button>
								<button type="button" class="btn btn-primary" onclick={applyStateDraft}>
									Done
								</button>
							</div>
						</footer>
					</div>
				</div>
			{/if}
		</form>
	{/if}
</dialog>

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

	.portrait {
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

	.portrait-sm {
		width: 48px;
		height: 48px;
		border-radius: 8px;
	}

	.portrait img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.portrait-fallback {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.portrait-sm .portrait-fallback {
		font-size: 1rem;
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

	.summary-bio,
	.summary-meta {
		margin: 0.35rem 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.6rem;
	}

	.tag {
		font-size: 0.75rem;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.modal {
		border: none;
		padding: 0;
		margin: auto;
		position: fixed;
		inset: 0;
		width: min(640px, calc(100vw - 2rem));
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
		position: relative;
	}

	.modal-panel label {
		color: var(--text);
	}

	.modal-panel-sm {
		width: min(420px, calc(100vw - 2rem));
	}

	.state-overlay {
		position: fixed;
		inset: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.state-overlay-dismiss {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		background: rgba(0, 0, 0, 0.35);
		cursor: default;
	}

	.state-overlay-panel {
		position: relative;
		z-index: 1;
		max-height: calc(100vh - 3rem);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
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
		position: sticky;
		bottom: 0;
		background: var(--bg-elevated);
		z-index: 1;
	}

	.modal-footer-right {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.states-block {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.states-block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.states-block-head h3 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text);
	}

	.state-summary-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.state-summary-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.state-summary-body {
		flex: 1;
		min-width: 0;
	}

	.state-summary-body strong {
		display: inline;
		margin-right: 0.35rem;
		color: var(--text);
	}

	.state-summary-body .id {
		color: var(--text-muted);
	}

	.badge-default {
		display: inline-block;
		margin-left: 0.35rem;
		font-size: 0.7rem;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		background: var(--accent-dim);
		color: #fff;
		vertical-align: middle;
	}

	.portrait-upload-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.portrait-upload-controls {
		flex: 1;
		min-width: 0;
	}

	.portrait-field input[type='file'] {
		font-size: 0.85rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}

	.portrait-hint {
		margin: 0.25rem 0 0;
		font-size: 0.75rem;
		font-family: var(--mono);
		color: var(--text-muted);
		word-break: break-all;
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

	.status.saved {
		color: var(--success);
	}

	.status.error {
		color: var(--error);
	}
</style>
