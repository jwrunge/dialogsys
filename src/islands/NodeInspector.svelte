<script lang="ts">
	import type { GraphNode, GraphNodeData, ChoiceOption } from '../lib/schema/graph';
	import { nanoid } from 'nanoid';

	interface Props {
		node: GraphNode | null;
		characterIds: string[];
		dialogIds: string[];
		onchange: (node: GraphNode) => void;
	}

	let { node, characterIds, dialogIds, onchange }: Props = $props();

	function updateData(patch: Partial<GraphNodeData>) {
		if (!node) return;
		onchange({
			...node,
			data: { ...node.data, ...patch },
		});
	}

	function addOption() {
		if (!node) return;
		const options: ChoiceOption[] = [
			...(node.data.options ?? []),
			{ id: nanoid(8), text: 'New option', conditions: [] },
		];
		updateData({ options });
	}
</script>

{#if !node}
	<p class="muted">Select a node to edit.</p>
{:else}
	<h3>{node.type} <code>{node.id}</code></h3>

	{#if node.type === 'line'}
		<div class="field">
			<label>Speaker (character id)</label>
			<select
				value={node.data.speaker ?? ''}
				onchange={(e) => updateData({ speaker: (e.currentTarget as HTMLSelectElement).value })}
			>
				<option value="">—</option>
				{#each characterIds as id}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>Text</label>
			<textarea
				value={node.data.text ?? ''}
				oninput={(e) => updateData({ text: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="4"
			></textarea>
		</div>
		<div class="field">
			<label>Portrait path</label>
			<input
				value={node.data.portraitPath ?? ''}
				oninput={(e) =>
					updateData({ portraitPath: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
		<div class="field">
			<label>Emotion</label>
			<input
				value={node.data.emotion ?? ''}
				oninput={(e) => updateData({ emotion: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
	{:else if node.type === 'choice'}
		{#each node.data.options ?? [] as opt, i}
			<div class="option-card">
				<div class="field">
					<label>Option {i + 1}</label>
					<input
						value={opt.text}
						oninput={(e) => {
							const options = [...(node!.data.options ?? [])];
							options[i] = { ...opt, text: (e.currentTarget as HTMLInputElement).value };
							updateData({ options });
						}}
					/>
				</div>
				<p class="hint">Connect from handle "{opt.id}" to target node</p>
			</div>
		{/each}
		<button type="button" class="btn" onclick={addOption}>Add option</button>
	{:else if node.type === 'condition'}
		<div class="field">
			<label>Scope</label>
			<select
				value={node.data.branchScope ?? 'global'}
				onchange={(e) =>
					updateData({ branchScope: (e.currentTarget as HTMLSelectElement).value as 'global' | 'character' })}
			>
				<option value="global">global</option>
				<option value="character">character</option>
			</select>
		</div>
		{#if node.data.branchScope === 'character'}
			<div class="field">
				<label>Character ID</label>
				<input
					value={node.data.branchCharacterId ?? ''}
					oninput={(e) =>
						updateData({ branchCharacterId: (e.currentTarget as HTMLInputElement).value })}
				/>
			</div>
		{/if}
		<div class="field">
			<label>Variable</label>
			<input
				value={node.data.branchVar ?? ''}
				oninput={(e) => updateData({ branchVar: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
		<p class="hint">Wire "true" / "false" handles to branch targets</p>
	{:else if node.type === 'set_var'}
		<p class="hint">Configure set operations in node data (advanced). Use inspector after adding ops via graph.</p>
		<div class="field">
			<label>JSON ops (setOps array)</label>
			<textarea
				value={JSON.stringify(node.data.setOps ?? [], null, 2)}
				onchange={(e) => {
					try {
						updateData({ setOps: JSON.parse((e.currentTarget as HTMLTextAreaElement).value) });
					} catch {
						/* ignore invalid json while typing */
					}
				}}
				rows="6"
			></textarea>
		</div>
	{:else if node.type === 'jump'}
		<div class="field">
			<label>Target dialog</label>
			<select
				value={node.data.targetDialogId ?? ''}
				onchange={(e) =>
					updateData({ targetDialogId: (e.currentTarget as HTMLSelectElement).value })}
			>
				<option value="">—</option>
				{#each dialogIds as id}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</div>
	{:else if node.type === 'direction'}
		<div class="field">
			<label>Direction text</label>
			<textarea
				value={node.data.directionText ?? ''}
				oninput={(e) =>
					updateData({ directionText: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="5"
			></textarea>
		</div>
		<div class="field">
			<label>Scene ref</label>
			<input
				value={node.data.sceneRef ?? ''}
				oninput={(e) => updateData({ sceneRef: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
	{:else if node.type === 'entry' || node.type === 'end'}
		<p class="muted">Structural node — connect edges to define flow.</p>
	{/if}
{/if}

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

	.option-card {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}
</style>
