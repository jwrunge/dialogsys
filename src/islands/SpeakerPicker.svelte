<script lang="ts">
import type { Character } from '../lib/schema/characters';
import type CharacterEditorModal from './CharacterEditorModal.svelte';

interface Props {
	slug: string;
	characters: Character[];
	value: string;
	onchange: (speakerId: string, character?: Character) => void;
	oncharacterschange: (characters: Character[]) => void;
}

let { slug, characters, value, onchange, oncharacterschange }: Props = $props();

let menuOpen = $state(false);
let rootEl = $state<HTMLDivElement | null>(null);
let characterModal = $state<CharacterEditorModal | null>(null);

const selectedLabel = $derived.by(() => {
	if (!value) return '—';
	return characters.find((c) => c.id === value)?.displayName ?? value;
});

function toggleMenu() {
	menuOpen = !menuOpen;
}

function selectSpeaker(speakerId: string) {
	menuOpen = false;
	const char = characters.find((c) => c.id === speakerId);
	onchange(speakerId, char);
}

function openAddCharacter() {
	menuOpen = false;
	characterModal?.openAdd();
}

function handleCharactersSaved(next: Character[], saved: Character) {
	oncharacterschange(next);
	onchange(saved.id, saved);
}

$effect(() => {
	if (!menuOpen) return;
	function onDocClick(e: MouseEvent) {
		if (!rootEl?.contains(e.target as Node)) menuOpen = false;
	}
	document.addEventListener('mousedown', onDocClick);
	return () => document.removeEventListener('mousedown', onDocClick);
});
</script>

<div class="speaker-picker" bind:this={rootEl}>
	<label class="sr-only" for="speaker-picker-trigger">Speaker</label>
	<button
		id="speaker-picker-trigger"
		type="button"
		class="speaker-trigger"
		aria-haspopup="listbox"
		aria-expanded={menuOpen}
		onclick={toggleMenu}
	>
		<span class="speaker-value">{selectedLabel}</span>
		<span class="chevron" aria-hidden="true">▾</span>
	</button>

	{#if menuOpen}
		<ul class="speaker-menu" role="listbox">
			<li role="presentation">
				<button
					type="button"
					class="speaker-option"
					class:selected={!value}
					role="option"
					aria-selected={!value}
					onclick={() => selectSpeaker('')}
				>
					—
				</button>
			</li>
			{#each characters as c (c.id)}
				<li role="presentation">
					<button
						type="button"
						class="speaker-option"
						class:selected={value === c.id}
						role="option"
						aria-selected={value === c.id}
						onclick={() => selectSpeaker(c.id)}
					>
						{c.displayName}
					</button>
				</li>
			{/each}
			<li role="presentation" class="add-prompt">
				<button type="button" class="add-option" onclick={openAddCharacter}>
					Add character…
				</button>
			</li>
		</ul>
	{/if}
</div>

<CharacterEditorModal
	bind:this={characterModal}
	{slug}
	{characters}
	onsaved={handleCharactersSaved}
/>

<style>
	.speaker-picker {
		position: relative;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.speaker-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
		text-align: left;
	}

	.speaker-trigger:hover {
		border-color: var(--accent-dim);
	}

	.speaker-value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.speaker-menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.25rem 0;
		list-style: none;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		max-height: 16rem;
		overflow-y: auto;
	}

	.speaker-option,
	.add-option {
		display: block;
		width: 100%;
		padding: 0.45rem 0.75rem;
		border: none;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.speaker-option:hover,
	.add-option:hover {
		background: var(--bg-hover);
	}

	.speaker-option.selected {
		background: var(--accent-dim);
		color: #fff;
	}

	.add-prompt {
		margin-top: 0.25rem;
		padding-top: 0.25rem;
		border-top: 1px solid var(--border);
	}

	.add-option {
		color: var(--accent);
		font-weight: 500;
	}
</style>
