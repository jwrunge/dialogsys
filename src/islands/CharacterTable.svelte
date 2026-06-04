<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import type { Character, CharactersFile } from '../lib/schema/characters';
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
			},
		];
	}

	function removeCharacter(index: number) {
		characters = characters.filter((_, i) => i !== index);
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

{#if characters.length === 0}
	<p class="muted">No characters yet. Add one to use in dialog lines.</p>
{:else}
	<div class="char-list">
		{#each characters as char, i (char.id)}
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
					<label>Portrait path (Godot res://)</label>
					<input bind:value={char.portraitPath} placeholder="res://portraits/bartender.png" />
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
				<button type="button" class="btn btn-danger" onclick={() => removeCharacter(i)}>
					Remove
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

	.muted {
		color: var(--text-muted);
	}
</style>
