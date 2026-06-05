<script lang="ts">
	import { tick } from 'svelte';
	import Fuse from 'fuse.js';
	import { api } from '../lib/api';
	import type { DialogListItem } from '../lib/server/projects';
	import {
		createCompareBranch,
		formatBranchPathSummary,
		syncEnumBranchOptions,
		usesEnumValues,
	} from '../lib/flow/branchState';
	import type { ConditionOp } from '../lib/schema/conditions';
	import type { FlowBranchOption, FlowNode, FlowNodeData } from '../lib/schema/flow';
	import type { GameStateProperty } from '../lib/schema/gameState';

	interface Props {
		slug: string;
		node: FlowNode | null;
		dialogs: DialogListItem[];
		gameStateProperties: GameStateProperty[];
		onchange: (node: FlowNode) => void;
		onTypeChange: (type: 'scene' | 'branch') => void;
		ondelete: () => void;
		onEditDialog: (dialogId: string, title?: string) => void;
		onDialogsRefresh: () => Promise<void>;
	}

	let {
		slug,
		node,
		dialogs,
		gameStateProperties,
		onchange,
		onTypeChange,
		ondelete,
		onEditDialog,
		onDialogsRefresh,
	}: Props = $props();

	let searchQuery = $state('');
	let stateSearchQuery = $state('');

	const OP_OPTIONS: { value: ConditionOp; label: string }[] = [
		{ value: 'eq', label: '=' },
		{ value: 'neq', label: '≠' },
		{ value: 'gt', label: '>' },
		{ value: 'gte', label: '≥' },
		{ value: 'lt', label: '<' },
		{ value: 'lte', label: '≤' },
	];
	let selectSceneDialogEl = $state<HTMLDialogElement | null>(null);
	let createDialogEl = $state<HTMLDialogElement | null>(null);
	let draftId = $state('');
	let draftName = $state('');
	let modalError = $state('');
	let creating = $state(false);

	const assignedDialog = $derived(
		node?.type === 'scene' && node.data.dialogId
			? dialogs.find((d) => d.id === node.data.dialogId)
			: null,
	);

	const listedStates = $derived.by(() => {
		const q = stateSearchQuery.trim();
		if (!q) return gameStateProperties;
		const fuse = new Fuse(gameStateProperties, {
			keys: [
				{ name: 'label', weight: 0.55 },
				{ name: 'id', weight: 0.45 },
			],
			threshold: 0.4,
			ignoreLocation: true,
		});
		return fuse.search(q).map((r) => r.item);
	});

	const branchProperty = $derived(
		node?.type === 'branch' && node.data.branchStateId
			? gameStateProperties.find((p) => p.id === node.data.branchStateId)
			: null,
	);

	const isEnumBranch = $derived(branchProperty ? usesEnumValues(branchProperty) : false);

	const listedDialogs = $derived.by(() => {
		const q = searchQuery.trim();
		if (!q) return dialogs;
		const fuse = new Fuse(dialogs, {
			keys: [
				{ name: 'displayName', weight: 0.5 },
				{ name: 'id', weight: 0.35 },
				{ name: 'description', weight: 0.15 },
			],
			threshold: 0.4,
			ignoreLocation: true,
		});
		return fuse.search(q).map((r) => r.item);
	});

	function updateData(patch: Partial<FlowNodeData>) {
		if (!node) return;
		onchange({ ...node, data: { ...node.data, ...patch } });
	}

	function slugifyLabel(label: string): string {
		return (
			label
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_|_$/g, '')
				.slice(0, 32) || 'scene'
		);
	}

	async function openSelectSceneModal() {
		if (!node || node.type !== 'scene') return;
		searchQuery = '';
		modalError = '';
		await tick();
		selectSceneDialogEl?.showModal();
	}

	function closeSelectSceneModal() {
		selectSceneDialogEl?.close();
	}

	function selectScene(dialog: DialogListItem) {
		if (!node || node.type !== 'scene') return;
		updateData({
			dialogId: dialog.id,
			label: node.data.label?.trim() ? node.data.label : dialog.displayName,
		});
		closeSelectSceneModal();
	}

	async function openCreateFromSelect() {
		closeSelectSceneModal();
		await openCreateModal();
	}

	async function openCreateModal() {
		if (!node || node.type !== 'scene') return;
		draftName = node.data.label?.trim() || 'New scene';
		draftId = slugifyLabel(draftName);
		modalError = '';
		await tick();
		createDialogEl?.showModal();
	}

	function closeCreateModal() {
		createDialogEl?.close();
		modalError = '';
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		if (!node || creating) return;
		modalError = '';
		creating = true;
		const id = draftId.trim();
		const displayName = draftName.trim();
		try {
			await api(`/api/projects/${slug}/dialogs`, {
				method: 'POST',
				body: JSON.stringify({ id, displayName }),
			});
			await onDialogsRefresh();
			updateData({ dialogId: id, label: displayName });
			closeCreateModal();
			onEditDialog(id, displayName);
		} catch (err) {
			modalError = (err as Error).message;
		} finally {
			creating = false;
		}
	}

	function enumOptionsKey(options: FlowBranchOption[]): string {
		return options
			.map((o) => `${o.id}:${JSON.stringify(o.matchValue)}:${o.label}`)
			.join('|');
	}

	$effect(() => {
		if (!node || node.type !== 'branch' || !branchProperty || !isEnumBranch) return;
		const synced = syncEnumBranchOptions(branchProperty, node.data.options ?? []);
		const current = node.data.options ?? [];
		if (enumOptionsKey(synced) !== enumOptionsKey(current)) {
			updateData({ options: synced });
		}
	});

	function selectBranchState(prop: GameStateProperty) {
		if (!node || node.type !== 'branch') return;
		const options = usesEnumValues(prop) ? syncEnumBranchOptions(prop) : [];
		onchange({
			...node,
			data: {
				...node.data,
				branchStateId: prop.id,
				label: node.data.label?.trim() ? node.data.label : prop.label,
				options,
			},
		});
	}

	function clearBranchState() {
		updateData({ branchStateId: undefined, options: [] });
	}

	function setPathDefault(optionId: string) {
		if (!node || node.type !== 'branch') return;
		const options = (node.data.options ?? []).map((o) => ({
			...o,
			isDefault: o.id === optionId,
		}));
		updateData({ options });
	}

	function addCompareBranch() {
		if (!node || node.type !== 'branch' || !branchProperty) return;
		const options = [...(node.data.options ?? []), createCompareBranch(branchProperty)];
		updateData({ options });
	}

	function removeCompareBranch(optionId: string) {
		if (!node || node.type !== 'branch') return;
		updateData({
			options: (node.data.options ?? []).filter((o) => o.id !== optionId),
		});
	}

	function updateCompareOption(
		optionId: string,
		patch: Partial<FlowBranchOption>,
	) {
		if (!node || node.type !== 'branch') return;
		const options = (node.data.options ?? []).map((o) =>
			o.id === optionId ? { ...o, ...patch } : o,
		);
		updateData({ options });
	}

	function parseCompareValue(
		raw: string,
		prop: GameStateProperty,
	): boolean | number | string {
		if (prop.type === 'boolean') return raw === 'true';
		if (prop.type === 'number') return Number(raw);
		return raw;
	}
</script>

{#if !node}
	<p class="muted">Click a node to assign a scene or edit its label.</p>
{:else}
	<h3>{node.type} <code>{node.id}</code></h3>

	{#if node.type === 'scene' || node.type === 'branch'}
		<div class="type-toggle" role="group" aria-label="Node type">
			<button
				type="button"
				class:active={node.type === 'scene'}
				onclick={() => onTypeChange('scene')}
			>
				Scene
			</button>
			<button
				type="button"
				class:active={node.type === 'branch'}
				onclick={() => onTypeChange('branch')}
			>
				Branch
			</button>
		</div>
	{/if}

	<div class="field">
		<label for="flow-label">Label</label>
		<input
			id="flow-label"
			value={node.data.label ?? ''}
			oninput={(e) => updateData({ label: (e.currentTarget as HTMLInputElement).value })}
		/>
	</div>

	{#if node.type === 'scene'}
		<button
			type="button"
			class="scene-box"
			class:empty={!assignedDialog}
			onclick={openSelectSceneModal}
		>
			{#if assignedDialog}
				<span class="pick-name">{assignedDialog.displayName}</span>
				<span class="pick-id">{assignedDialog.id}</span>
			{:else}
				<span class="select-placeholder">Select Scene</span>
			{/if}
		</button>
	{:else if node.type === 'branch'}
		<div class="field">
			<label for="flow-state-search">Branch on state</label>
			<input
				id="flow-state-search"
				class="search"
				type="search"
				bind:value={stateSearchQuery}
				placeholder="Search state…"
			/>
		</div>

		<div class="dialog-pick-list">
			<button
				type="button"
				class="pick-item"
				class:selected={!node.data.branchStateId}
				onclick={clearBranchState}
			>
				<span class="pick-name">— None —</span>
			</button>
			{#each listedStates as prop (prop.id)}
				<button
					type="button"
					class="pick-item"
					class:selected={node.data.branchStateId === prop.id}
					onclick={() => selectBranchState(prop)}
				>
					<span class="pick-name">{prop.label}</span>
					<span class="pick-id">{prop.id}</span>
				</button>
			{/each}
		</div>

		{#if !branchProperty}
			<p class="hint">
				Select a global state property. If it has valid values, paths are created automatically.
				Otherwise add comparison branches against that state.
			</p>
		{:else if isEnumBranch}
			<p class="hint">
				Branching on <strong>{branchProperty.label}</strong> — one path per valid value.
			</p>
			{#each node.data.options ?? [] as opt, i (opt.id)}
				<section class="path-block">
					<div class="enum-path">
						<span class="match-badge">= {String(opt.matchValue)}</span>
						<div class="field">
							<label for={`path-label-${opt.id}`}>Path {i + 1} label</label>
							<input
								id={`path-label-${opt.id}`}
								value={opt.label}
								oninput={(e) => {
									const options = [...(node!.data.options ?? [])];
									options[i] = {
										...opt,
										label: (e.currentTarget as HTMLInputElement).value,
									};
									updateData({ options });
								}}
							/>
						</div>
					</div>
					<p class="hint summary">
						{formatBranchPathSummary(opt, branchProperty)}
					</p>
				</section>
			{/each}
		{:else}
			<p class="hint">
				Branching on <strong>{branchProperty.label}</strong> — add comparison rules. Mark one path
				as the default fallback when nothing else matches.
			</p>
			{#each node.data.options ?? [] as opt, i (opt.id)}
				<section class="path-block">
					<div class="compare-row">
						<span class="state-prefix">{branchProperty.label}</span>
						<div class="field compare-op">
							<label for={`op-${opt.id}`} class="sr-only">Operator</label>
							<select
								id={`op-${opt.id}`}
								value={opt.compareOp ?? 'eq'}
								onchange={(e) =>
									updateCompareOption(opt.id, {
										compareOp: (e.currentTarget as HTMLSelectElement)
											.value as ConditionOp,
									})}
							>
								{#each OP_OPTIONS as op (op.value)}
									<option value={op.value}>{op.label}</option>
								{/each}
							</select>
						</div>
						<div class="field compare-value">
							<label for={`val-${opt.id}`}>Value</label>
							{#if branchProperty.type === 'boolean'}
								<select
									id={`val-${opt.id}`}
									value={String(opt.compareValue ?? false)}
									onchange={(e) =>
										updateCompareOption(opt.id, {
											compareValue: parseCompareValue(
												(e.currentTarget as HTMLSelectElement).value,
												branchProperty,
											),
										})}
								>
									<option value="false">false</option>
									<option value="true">true</option>
								</select>
							{:else if branchProperty.type === 'number'}
								<input
									id={`val-${opt.id}`}
									type="number"
									value={Number(opt.compareValue ?? 0)}
									oninput={(e) =>
										updateCompareOption(opt.id, {
											compareValue: parseCompareValue(
												(e.currentTarget as HTMLInputElement).value,
												branchProperty,
											),
										})}
								/>
							{:else}
								<input
									id={`val-${opt.id}`}
									type="text"
									value={String(opt.compareValue ?? '')}
									oninput={(e) =>
										updateCompareOption(opt.id, {
											compareValue: (e.currentTarget as HTMLInputElement).value,
										})}
								/>
							{/if}
						</div>
					</div>
					<div class="option-row">
						<div class="field">
							<label for={`cmp-label-${opt.id}`}>Path label</label>
							<input
								id={`cmp-label-${opt.id}`}
								value={opt.label}
								oninput={(e) => {
									const options = [...(node!.data.options ?? [])];
									options[i] = {
										...opt,
										label: (e.currentTarget as HTMLInputElement).value,
									};
									updateData({ options });
								}}
							/>
						</div>
						<button
							type="button"
							class="btn btn-danger btn-sm"
							onclick={() => removeCompareBranch(opt.id)}
						>
							Remove
						</button>
					</div>
					<label class="default-check">
						<input
							type="radio"
							name={`default-${node.id}`}
							checked={opt.isDefault === true}
							onchange={() => setPathDefault(opt.id)}
						/>
						Default fallback path
					</label>
					<p class="hint summary">
						{formatBranchPathSummary(opt, branchProperty)}
					</p>
				</section>
			{/each}
			<button type="button" class="btn" onclick={addCompareBranch}>Add branch</button>
		{/if}
	{:else if node.type === 'start'}
		<p class="hint">Connect from here to your first scene. Only one game start node.</p>
	{:else if node.type === 'end'}
		<p class="hint">Terminal node — connect scenes and branches here when the game ends.</p>
		<div class="field">
			<label for="flow-notes">Notes</label>
			<textarea
				id="flow-notes"
				value={node.data.notes ?? ''}
				oninput={(e) => updateData({ notes: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="3"
			></textarea>
		</div>
	{/if}

	{#if node.type !== 'start'}
		<div class="inspector-actions">
			<div class="action-grid">
				{#if node.type === 'scene' && node.data.dialogId}
					<button
						type="button"
						class="btn btn-primary"
						onclick={() => onEditDialog(node.data.dialogId!, node.data.label)}
					>
						Edit dialog
					</button>
				{/if}
				<button type="button" class="btn btn-danger" onclick={ondelete}>Delete node</button>
			</div>
		</div>
	{/if}
{/if}

<dialog bind:this={selectSceneDialogEl} class="modal" onclose={closeSelectSceneModal}>
	<div class="modal-panel">
		<header class="modal-header">
			<h2>Select scene</h2>
		</header>
		<div class="modal-body">
			<div class="field">
				<label for="select-scene-search">Search</label>
				<input
					id="select-scene-search"
					class="search"
					type="search"
					bind:value={searchQuery}
					placeholder="Search scenes…"
				/>
			</div>
			<div class="dialog-pick-list modal-pick-list">
				{#each listedDialogs as d (d.id)}
					<button type="button" class="pick-item" onclick={() => selectScene(d)}>
						<span class="pick-name">{d.displayName}</span>
						<span class="pick-id">{d.id}</span>
					</button>
				{/each}
			</div>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeSelectSceneModal}>Cancel</button>
				<button type="button" class="btn btn-primary" onclick={openCreateFromSelect}>
					Create…
				</button>
			</div>
		</footer>
	</div>
</dialog>

<dialog bind:this={createDialogEl} class="modal" onclose={closeCreateModal}>
	<form class="modal-panel" onsubmit={submitCreate}>
		<header class="modal-header">
			<h2>Create scene</h2>
		</header>
		<div class="modal-body">
			{#if modalError}
				<p class="error">{modalError}</p>
			{/if}
			<div class="field">
				<label for="new-scene-id">ID</label>
				<input
					id="new-scene-id"
					bind:value={draftId}
					required
					pattern="[a-z][a-z0-9_]*"
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label for="new-scene-name">Display name</label>
				<input id="new-scene-name" bind:value={draftName} required autocomplete="off" />
			</div>
			<p class="hint">The new dialog is created and assigned to this flow node automatically.</p>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeCreateModal} disabled={creating}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={creating}>
					{creating ? 'Creating…' : 'Create & assign'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	h3 {
		font-size: 0.95rem;
		margin-bottom: 1rem;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.search {
		width: 100%;
	}

	.dialog-pick-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 240px;
		overflow-y: auto;
		margin-bottom: 0.75rem;
	}

	.pick-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.pick-item:hover {
		background: var(--bg-hover);
	}

	.pick-item.selected {
		border-color: var(--accent);
		background: var(--bg-hover);
	}

	.pick-name {
		font-size: 0.9rem;
	}

	.pick-id {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.type-toggle {
		display: flex;
		gap: 0;
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.type-toggle button {
		flex: 1;
		padding: 0.45rem 0.75rem;
		border: none;
		background: var(--bg);
		color: var(--text-muted);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.type-toggle button:first-child {
		border-radius: calc(var(--radius) - 1px) 0 0 calc(var(--radius) - 1px);
	}

	.type-toggle button:last-child {
		border-radius: 0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0;
	}

	.type-toggle button + button {
		border-left: 1px solid var(--border);
	}

	.type-toggle button:hover {
		background: var(--bg-hover);
		color: var(--text);
	}

	.type-toggle button.active {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 600;
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.scene-box {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		text-align: left;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.scene-box:hover {
		background: var(--bg-hover);
	}

	.scene-box.empty {
		border-style: dashed;
		align-items: center;
		justify-content: center;
		min-height: 3.5rem;
	}

	.select-placeholder {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.inspector-actions {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.action-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.action-grid .btn-danger:only-child {
		grid-column: 1 / -1;
	}

	.modal-pick-list {
		max-height: 280px;
		margin-bottom: 0;
	}

	.path-block {
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.path-block:last-of-type {
		border-bottom: none;
	}

	.default-check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.5rem 0 0.75rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		cursor: pointer;
	}

	.field-label {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
		color: var(--text-muted);
	}

	.summary {
		margin-top: 0.35rem;
		font-family: var(--mono);
		font-size: 0.75rem;
	}

	.enum-path {
		display: flex;
		gap: 0.65rem;
		align-items: flex-end;
	}

	.match-badge {
		flex-shrink: 0;
		padding: 0.35rem 0.55rem;
		margin-bottom: 0.35rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
	}

	.enum-path .field {
		flex: 1;
	}

	.compare-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		margin-bottom: 0.5rem;
	}

	.state-prefix {
		flex-shrink: 0;
		padding-bottom: 0.35rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
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

	.compare-op {
		flex: 0 0 4.5rem;
	}

	.compare-value {
		flex: 1;
	}

	.option-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		margin-bottom: 0.5rem;
	}

	.option-row .field {
		flex: 1;
		margin: 0;
	}

	.btn-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.error {
		color: var(--error);
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
