<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type {
		GameStateFile,
		GameStateProperty,
		GameStatePropertyType,
	} from '../lib/schema/gameState';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let properties = $state<GameStateProperty[]>([]);
	let ready = $state(false);
	let loadError = $state('');
	let saveStatus = $state('');
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let draft = $state<GameStateProperty | null>(null);
	let editIndex = $state<number | null>(null);

	function cloneProperty(prop: GameStateProperty): GameStateProperty {
		return JSON.parse(JSON.stringify(prop)) as GameStateProperty;
	}

	function defaultValueForType(type: GameStatePropertyType): boolean | number | string {
		if (type === 'boolean') return false;
		if (type === 'number') return 0;
		return '';
	}

	function newProperty(): GameStateProperty {
		const id = `var_${nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
		return {
			id,
			label: 'New property',
			type: 'boolean',
			defaultValue: false,
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

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
	}

	async function save() {
		saveStatus = 'Saving…';
		try {
			const res = await api<GameStateFile>(`/api/projects/${slug}/game-state`, {
				method: 'PUT',
				body: JSON.stringify({ properties }),
			});
			properties = res.properties;
			saveStatus = 'Saved';
			setTimeout(() => {
				if (saveStatus === 'Saved') saveStatus = '';
			}, 1500);
		} catch (e) {
			saveStatus = (e as Error).message;
		}
	}

	async function load() {
		ready = false;
		loadError = '';
		try {
			const res = await api<GameStateFile>(`/api/projects/${slug}/game-state`);
			properties = res.properties;
			ready = true;
		} catch (e) {
			loadError = (e as Error).message;
		}
	}

	async function openAdd() {
		draft = newProperty();
		editIndex = null;
		await tick();
		dialogEl?.showModal();
	}

	async function openEdit(index: number) {
		draft = cloneProperty(properties[index]!);
		editIndex = index;
		await tick();
		dialogEl?.showModal();
	}

	function closeModal() {
		dialogEl?.close();
		draft = null;
		editIndex = null;
	}

	function applyDraft() {
		if (!draft) return;
		const next = cloneProperty(draft);
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
		draft = {
			...draft,
			type,
			defaultValue: defaultValueForType(type),
		};
	}

	onMount(load);
</script>

<div class="state-editor">
	<div class="toolbar">
		<button type="button" class="btn btn-primary" onclick={openAdd} disabled={!ready}>
			Add property
		</button>
		<span class="status" class:saved={saveStatus === 'Saved'}>{saveStatus}</span>
	</div>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if !ready}
		<p class="muted">Loading…</p>
	{:else if properties.length === 0}
		<p class="muted">
			No global state properties yet. Add booleans, numbers, or strings that drive scene branches in
			the Flow editor.
		</p>
	{:else}
		<div class="property-list">
			{#each properties as prop, i (prop.id)}
				<article class="property-card">
					<div class="property-head">
						<strong>{prop.label}</strong>
						<code>{prop.id}</code>
					</div>
					<p class="property-meta">
						<span class="type">{prop.type}</span>
						<span>default: {String(prop.defaultValue)}</span>
					</p>
					{#if prop.description}
						<p class="property-desc">{prop.description}</p>
					{/if}
					<div class="property-actions">
						<button type="button" class="btn" onclick={() => openEdit(i)}>Edit</button>
						<button type="button" class="btn btn-danger" onclick={() => removeProperty(i)}>
							Remove
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

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
				<h2>{editIndex === null ? 'Add property' : 'Edit property'}</h2>
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
				<div class="field">
					<label for="prop-default">Default value</label>
					{#if draft.type === 'boolean'}
						<select
							id="prop-default"
							value={String(draft.defaultValue)}
							onchange={(e) => {
								draft = {
									...draft!,
									defaultValue: (e.currentTarget as HTMLSelectElement).value === 'true',
								};
							}}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					{:else if draft.type === 'number'}
						<input
							id="prop-default"
							type="number"
							value={Number(draft.defaultValue)}
							oninput={(e) => {
								draft = {
									...draft!,
									defaultValue: Number((e.currentTarget as HTMLInputElement).value),
								};
							}}
						/>
					{:else}
						<input
							id="prop-default"
							type="text"
							value={String(draft.defaultValue)}
							oninput={(e) => {
								draft = {
									...draft!,
									defaultValue: (e.currentTarget as HTMLInputElement).value,
								};
							}}
						/>
					{/if}
				</div>
				<div class="field">
					<label for="prop-desc">Description (optional)</label>
					<textarea id="prop-desc" bind:value={draft.description} rows="2"></textarea>
				</div>
			</div>
			<footer class="modal-footer">
				<div class="modal-footer-right">
					<button type="button" class="btn" onclick={closeModal}>Cancel</button>
					<button type="submit" class="btn btn-primary">Done</button>
				</div>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.status {
		margin-left: auto;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.status.saved {
		color: var(--success);
	}

	.property-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.property-card {
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
	}

	.property-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.property-meta {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		display: flex;
		gap: 0.75rem;
	}

	.type {
		text-transform: uppercase;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--accent);
	}

	.property-desc {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.property-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.muted,
	.error {
		color: var(--text-muted);
	}

	.error {
		color: var(--error);
	}

	.modal {
		border: none;
		padding: 0;
		margin: auto;
		background: transparent;
		max-width: min(28rem, calc(100vw - 2rem));
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.modal-panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
		padding: 1.25rem;
	}

	.modal-footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	.modal-footer-right {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
