<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import type { Character, CharacterState, CharactersFile } from '../lib/schema/characters';
	import { nanoid } from 'nanoid';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let characters = $state<Character[]>([]);
	let status = $state<'loading' | 'saved' | 'error' | 'idle'>('loading');
	let message = $state('');

	async function load() {
		status = 'loading';
		try {
			const data = await api<CharactersFile>(`/api/projects/${slug}/characters`);
			characters = data.characters;
			status = 'idle';
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	async function save() {
		status = 'loading';
		try {
			await api(`/api/projects/${slug}/characters`, {
				method: 'PUT',
				body: JSON.stringify({ characters }),
			});
			status = 'saved';
			message = 'Saved';
			setTimeout(() => {
				if (status === 'saved') status = 'idle';
			}, 2000);
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	function addCharacter() {
		const id = `char_${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
		characters = [
			...characters,
			{
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
						optOutUnusedWarning: false,
					},
				],
			},
		];
	}

	function removeCharacter(index: number) {
		characters = characters.filter((_, i) => i !== index);
	}

	function addState(charIndex: number) {
		const sid = `state_${nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
		const char = characters[charIndex];
		char.states = [
			...char.states,
			{
				id: sid,
				label: 'New State',
				portraitPath: '',
				optOutUnusedWarning: false,
			},
		];
		characters = [...characters];
	}

	function removeState(charIndex: number, stateIndex: number) {
		const char = characters[charIndex];
		const removed = char.states[stateIndex];
		if (removed.id === char.defaultStateId) return;
		char.states = char.states.filter((_, i) => i !== stateIndex);
		characters = [...characters];
	}

	function slugifyLabel(label: string): string {
		return label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '')
			.slice(0, 32) || 'state';
	}

	onMount(load);
</script>

<div class="toolbar">
	<button type="button" class="btn" onclick={addCharacter}>Add character</button>
	<button type="button" class="btn btn-primary" onclick={save}>Save</button>
	<span class="status" class:saved={status === 'saved'} class:error={status === 'error'}>
		{message || (status === 'loading' ? 'Loading…' : '')}
	</span>
</div>

<p class="hint">
	Each character has display states (e.g. Curious, Panicked) with their own portrait. Lines
	reference a state by id — undefined states appear in <a href={`/projects/${slug}/issues`}>Issues</a>.
</p>

{#if characters.length === 0}
	<p class="muted">No characters yet. Add one to use in dialog lines.</p>
{:else}
	<div class="char-list">
		{#each characters as char, ci (char.id)}
			<div class="char-card">
				<div class="field">
					<label>ID</label>
					<input bind:value={char.id} />
				</div>
				<div class="field">
					<label>Display name</label>
					<input bind:value={char.displayName} />
				</div>
				<div class="field">
					<label>Bio</label>
					<textarea bind:value={char.bio} rows="2"></textarea>
				</div>
				<div class="field">
					<label>Tags (comma-separated)</label>
					<input
						value={char.tags.join(', ')}
						oninput={(e) => {
							char.tags = (e.currentTarget as HTMLInputElement).value
								.split(',')
								.map((t) => t.trim())
								.filter(Boolean);
							characters = [...characters];
						}}
					/>
				</div>
				<div class="field">
					<label>Voice / style notes</label>
					<textarea bind:value={char.voiceNotes} rows="2"></textarea>
				</div>

				<section class="states-section">
					<h4>Display states</h4>
					<div class="field">
						<label>Default state</label>
						<select bind:value={char.defaultStateId}>
							{#each char.states as st}
								<option value={st.id}>{st.label} ({st.id})</option>
							{/each}
						</select>
					</div>
					{#each char.states as state, si (state.id)}
						<div class="state-card">
							<div class="state-row">
								<input
									bind:value={state.label}
									placeholder="Label"
									onchange={() => {
										if (state.id === 'default' || state.id.startsWith('state_')) {
											const next = slugifyLabel(state.label);
											if (next && !char.states.some((s, j) => j !== si && s.id === next)) {
												const wasDefault = char.defaultStateId === state.id;
												state.id = next;
												if (wasDefault) char.defaultStateId = next;
												characters = [...characters];
											}
										}
									}}
								/>
								<input bind:value={state.id} placeholder="state_id" title="State id" />
							</div>
							<div class="field">
								<label>Portrait (Godot res://)</label>
								<input
									bind:value={state.portraitPath}
									placeholder="res://portraits/{char.id}_{state.id}.png"
								/>
							</div>
							<label class="check">
								<input type="checkbox" bind:checked={state.optOutUnusedWarning} />
								Opt out: unused-state warning if never referenced in dialog
							</label>
							{#if state.id !== char.defaultStateId}
								<button
									type="button"
									class="btn btn-danger"
									onclick={() => removeState(ci, si)}>Remove state</button
								>
							{/if}
						</div>
					{/each}
					<button type="button" class="btn" onclick={() => addState(ci)}>Add state</button>
				</section>

				<button type="button" class="btn btn-danger" onclick={() => removeCharacter(ci)}>
					Remove character
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.char-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.char-card {
		padding: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.states-section {
		margin: 1rem 0;
		padding: 1rem;
		background: var(--bg);
		border-radius: var(--radius);
		border: 1px solid var(--border);
	}

	.states-section h4 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
	}

	.state-card {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.state-row {
		display: grid;
		grid-template-columns: 1fr 140px;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0.5rem 0;
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>
