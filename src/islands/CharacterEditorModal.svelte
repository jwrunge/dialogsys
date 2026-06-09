<script lang="ts">
import { tick } from 'svelte';
import { api } from '../lib/api';
import { portraitPreviewUrl } from '../lib/characters';
import {
	cloneCharacter,
	cloneState,
	newCharacter,
	newState,
	slugifyStateLabel,
} from '../lib/characters/editor';
import { uploadPortrait } from '../lib/client/download';
import type { Character, CharacterState } from '../lib/schema/characters';

interface Props {
	slug: string;
	characters: Character[];
	onsaved: (characters: Character[], saved: Character) => void;
}

let { slug, characters, onsaved }: Props = $props();

let dialogEl = $state<HTMLDialogElement | null>(null);
let characterDraft = $state<Character | null>(null);
let characterEditIndex = $state<number | null>(null);
let stateDraft = $state<CharacterState | null>(null);
let stateEditIndex = $state<number | null>(null);
let saving = $state(false);
let error = $state('');
let portraitUploading = $state(false);
let portraitUploadError = $state('');

export async function openAdd() {
	characterDraft = newCharacter();
	characterEditIndex = null;
	error = '';
	await tick();
	dialogEl?.showModal();
}

export async function openEdit(character: Character) {
	characterEditIndex = characters.findIndex((c) => c.id === character.id);
	characterDraft = cloneCharacter(character);
	error = '';
	await tick();
	dialogEl?.showModal();
}

function closeModal() {
	closeStateModal();
	dialogEl?.close();
	characterDraft = null;
	characterEditIndex = null;
	error = '';
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
		const next = slugifyStateLabel(stateDraft.label);
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

async function applyCharacterDraft(e: Event) {
	e.preventDefault();
	if (!characterDraft || saving) return;
	error = '';
	saving = true;
	const draft = cloneCharacter(characterDraft);
	const nextCharacters =
		characterEditIndex === null
			? [...characters, draft]
			: characters.map((c, i) => (i === characterEditIndex ? draft : c));
	try {
		await api(`/api/projects/${slug}/characters`, {
			method: 'PUT',
			body: JSON.stringify({ characters: nextCharacters }),
		});
		onsaved(nextCharacters, draft);
		closeModal();
	} catch (err) {
		error = (err as Error).message;
	} finally {
		saving = false;
	}
}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={closeModal}>
	{#if characterDraft}
		<form class="modal-panel" data-transmut="include" onsubmit={applyCharacterDraft}>
			<header class="modal-header">
				<h2>{characterEditIndex === null ? 'Add character' : 'Edit character'}</h2>
			</header>

			<div class="modal-body">
				{#if error}
					<p class="error">{error}</p>
				{/if}
				<div class="field">
					<label for="char-id">ID</label>
					<input
						id="char-id"
						bind:value={characterDraft.id}
						required
						pattern="[a-z][a-z0-9_]*"
					/>
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
						<select id="char-default-state" bind:value={characterDraft.defaultStateId}>
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
				<div class="modal-footer-right">
					<button type="button" class="btn" onclick={closeModal} disabled={saving}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? 'Saving…' : 'Done'}
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
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	.modal-footer-right {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
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
	}

	.state-summary-body {
		flex: 1;
		min-width: 0;
	}

	.state-summary-body strong {
		margin-right: 0.35rem;
	}

	.state-summary-body .id {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.portrait {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.portrait img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.portrait-fallback {
		font-size: 1rem;
		font-weight: 600;
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
	}

	.modal-panel-sm {
		width: min(420px, calc(100vw - 2rem));
	}

	.error {
		color: var(--error);
		margin: 0 0 1rem;
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

	.portrait-hint {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.portrait-sm {
		width: 40px;
		height: 40px;
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
</style>
