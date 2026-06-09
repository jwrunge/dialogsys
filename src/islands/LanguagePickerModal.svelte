<script lang="ts">
import Fuse from 'fuse.js';
import { tick } from 'svelte';
import { LOCALE_OPTIONS, type LocaleOption } from '../lib/i18n/locales';

interface Props {
	open?: boolean;
	selectedTag?: string;
	disabled?: boolean;
	onselect?: (tag: string) => void;
	onclose?: () => void;
}

let { open = false, selectedTag = 'en', disabled = false, onselect, onclose }: Props = $props();

let dialogEl = $state<HTMLDialogElement | null>(null);
let query = $state('');
let listEl = $state<HTMLUListElement | null>(null);

const bundled = $derived(LOCALE_OPTIONS.filter((option) => option.bundled));
const other = $derived(LOCALE_OPTIONS.filter((option) => !option.bundled));

const fuse = new Fuse(LOCALE_OPTIONS, {
	keys: ['nativeName', 'englishName', 'tag', 'searchText'],
	threshold: 0.35,
	ignoreLocation: true,
});

const filtered = $derived.by(() => {
	const q = query.trim();
	if (!q) return null;
	return fuse.search(q).map((result) => result.item);
});

const filteredBundled = $derived(filtered?.filter((option) => option.bundled) ?? []);
const filteredOther = $derived(filtered?.filter((option) => !option.bundled) ?? []);

$effect(() => {
	if (open) {
		query = '';
		void tick().then(() => dialogEl?.showModal());
	} else {
		dialogEl?.close();
	}
});

function close() {
	onclose?.();
}

function pick(option: LocaleOption) {
	onselect?.(option.tag);
	close();
}

function onDialogClose() {
	close();
}

function onDialogClick(e: MouseEvent) {
	if (e.target === dialogEl) close();
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		e.preventDefault();
		close();
	}
}
</script>

<dialog
	bind:this={dialogEl}
	class="language-picker-dialog"
	aria-labelledby="language-picker-title"
	onclose={onDialogClose}
	onclick={onDialogClick}
	onkeydown={onKeydown}
>
	<div class="language-picker-panel" data-transmut="include" role="document" onclick={(e) => e.stopPropagation()}>
		<header class="language-picker-header">
			<h2 id="language-picker-title">Choose language</h2>
			<button type="button" class="btn icon-close" aria-label="Close" onclick={close}>×</button>
		</header>

		<div class="language-picker-search">
			<label class="sr-only" for="language-search">Search languages…</label>
			<input
				id="language-search"
				type="search"
				placeholder="Search languages…"
				bind:value={query}
				autocomplete="off"
				{disabled}
			/>
		</div>

		<div class="language-picker-body">
			{#if filtered}
				{#if filtered.length === 0}
					<p class="empty">No languages match your search.</p>
				{:else}
					<section>
						<h3>Fully translated languages</h3>
						<ul bind:this={listEl} class="language-list">
							{#each filteredBundled as option (option.tag)}
								{@render languageRow(option)}
							{/each}
						</ul>
						{#if filteredOther.length > 0}
							<h3>More languages</h3>
							<p class="hint">Translated automatically on first use; quality may vary.</p>
							<ul class="language-list">
								{#each filteredOther as option (option.tag)}
									{@render languageRow(option)}
								{/each}
							</ul>
						{/if}
					</section>
				{/if}
			{:else}
				<section>
					<h3>Fully translated languages</h3>
					<ul class="language-list">
						{#each bundled as option (option.tag)}
							{@render languageRow(option)}
						{/each}
					</ul>
				</section>
				<section>
					<h3>More languages</h3>
					<p class="hint">Translated automatically on first use; quality may vary.</p>
					<ul class="language-list">
						{#each other as option (option.tag)}
							{@render languageRow(option)}
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	</div>
</dialog>

{#snippet languageRow(option: LocaleOption)}
	<li>
		<button
			type="button"
			class="language-option"
			class:selected={option.tag === selectedTag}
			aria-current={option.tag === selectedTag ? 'true' : undefined}
			{disabled}
			onclick={() => pick(option)}
		>
			<span class="native" data-transmut-skip>{option.nativeName}</span>
			<span class="english" data-transmut-skip>{option.englishName}</span>
			{#if option.bundled}
				<span class="badge">✓</span>
			{/if}
		</button>
	</li>
{/snippet}

<style>
	.language-picker-dialog {
		border: none;
		padding: 0;
		margin: auto;
		max-width: min(32rem, 96vw);
		width: 100%;
		background: transparent;
	}

	.language-picker-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.language-picker-panel {
		display: flex;
		flex-direction: column;
		max-height: min(80dvh, 36rem);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
	}

	.language-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elevated);
	}

	.language-picker-header h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.icon-close {
		font-size: 1.35rem;
		line-height: 1;
		padding: 0.15rem 0.45rem;
	}

	.language-picker-search {
		padding: 0.75rem 1rem 0;
	}

	.language-picker-search input {
		width: 100%;
	}

	.language-picker-body {
		overflow: auto;
		padding: 0.75rem 1rem 1rem;
	}

	.language-picker-body section + section {
		margin-top: 1rem;
	}

	.language-picker-body h3 {
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.hint {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.language-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.language-option {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		gap: 0.1rem 0.5rem;
		width: 100%;
		text-align: left;
		padding: 0.55rem 0.65rem;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		appearance: none;
		cursor: pointer;
	}

	.language-option:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--border);
	}

	.language-option.selected {
		background: var(--bg-hover);
		border-color: var(--accent-dim);
	}

	.language-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.native {
		font-size: 0.95rem;
		font-weight: 600;
		grid-column: 1;
	}

	.english {
		font-size: 0.8rem;
		color: var(--text-muted);
		grid-column: 1;
	}

	.badge {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		color: var(--success);
		font-size: 0.9rem;
	}

	.empty {
		margin: 0.5rem 0;
		color: var(--text-muted);
		font-size: 0.9rem;
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
</style>
