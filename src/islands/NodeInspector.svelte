<script lang="ts">
	import type { Character } from '../lib/schema/characters';
	import type { ConditionGroup } from '../lib/schema/conditions';
	import type { GraphNode, GraphNodeData, GraphEdge, ChoiceOption } from '../lib/schema/graph';
	import type { GameStateProperty } from '../lib/schema/gameState';
	import { resolvePortraitPath } from '../lib/characters';
	import { LEGACY_NODE_TYPE_LABELS, NODE_TYPE_OPTIONS } from '../lib/graph/nodeFactory';
	import { nanoid } from 'nanoid';
	import ConditionEditor from './ConditionEditor.svelte';

	interface Props {
		node: GraphNode | null;
		edges: GraphEdge[];
		nodes: GraphNode[];
		characters: Character[];
		gameStateProperties: GameStateProperty[];
		dialogIds: string[];
		onchange: (node: GraphNode) => void;
		onedgechange: (edge: GraphEdge) => void;
		onSetBranchTarget: (sourceId: string, handle: string, targetId: string) => void;
		onRemoveChoiceOption: (optionId: string) => void;
		ondelete: () => void;
	}

	let {
		node,
		edges,
		nodes,
		characters,
		gameStateProperties,
		dialogIds,
		onchange,
		onedgechange,
		onSetBranchTarget,
		onRemoveChoiceOption,
		ondelete,
	}: Props = $props();

	const optionCount = $derived(node?.type === 'choice' ? (node.data.options?.length ?? 0) : 0);

	const branchTargets = $derived(
		nodes.filter((n) => n.id !== node?.id && n.type !== 'entry').map((n) => n.id),
	);

	function branchTarget(handle: string): string {
		if (!node) return '';
		return (
			edges.find(
				(e) =>
					e.source === node.id &&
					(e.sourceHandle === handle || e.data?.branch === handle),
			)?.target ?? ''
		);
	}

	const speakerChar = $derived(
		characters.find((c) => c.id === node?.data.speaker),
	);

	const stateOptions = $derived(speakerChar?.states ?? []);

	const portraitPreview = $derived(
		resolvePortraitPath(
			speakerChar,
			node?.data.characterState || speakerChar?.defaultStateId,
			node?.data.portraitPath,
		),
	);

	const nodeEdges = $derived(
		node ? edges.filter((e) => e.source === node.id) : [],
	);

	function updateData(patch: Partial<GraphNodeData>) {
		if (!node) return;
		onchange({
			...node,
			data: { ...node.data, ...patch },
		});
	}

	function setType(type: string) {
		if (!node) return;
		onchange({ ...node, type: type as GraphNode['type'] });
	}

	function updateEdge(edgeId: string, patch: Partial<GraphEdge['data']>) {
		const edge = edges.find((e) => e.id === edgeId);
		if (!edge) return;
		onedgechange({
			...edge,
			data: { ...edge.data, ...patch },
		});
	}

	function addOption() {
		if (!node) return;
		const options: ChoiceOption[] = [
			...(node.data.options ?? []),
			{ id: nanoid(8), text: '', conditions: [] },
		];
		updateData({ options });
	}

	function removeOption(optionId: string) {
		if (!node || node.type !== 'choice' || optionCount <= 1) return;
		onRemoveChoiceOption(optionId);
	}

	function updateOptionConditions(index: number, conditions: ConditionGroup[]) {
		if (!node || node.type !== 'choice') return;
		const options = [...(node.data.options ?? [])];
		const opt = options[index];
		if (!opt) return;
		options[index] = { ...opt, conditions };
		updateData({ options });
	}

	function branchLabel(edge: GraphEdge): string {
		if (edge.sourceHandle === 'true' || edge.data?.branch === 'true') return 'True branch';
		if (edge.sourceHandle === 'false' || edge.data?.branch === 'false') return 'False branch';
		const opt = node?.data.options?.find((o) => o.id === edge.sourceHandle);
		return opt ? `Path: ${opt.text || opt.id}` : `Branch (${edge.sourceHandle ?? 'default'})`;
	}
</script>

{#if !node}
	<p class="muted">Click a node on the canvas to edit its properties.</p>
{:else}
	<h3>{node.type} <code>{node.id}</code></h3>

	{#if node.type !== 'entry'}
		<div class="field">
			<label for="inspector-type">Type</label>
			<select
				id="inspector-type"
				value={node.type}
				onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each NODE_TYPE_OPTIONS as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
				{#if node.type && !NODE_TYPE_OPTIONS.some((o) => o.value === node.type)}
					<option value={node.type}>
						{LEGACY_NODE_TYPE_LABELS[node.type] ?? node.type}
					</option>
				{/if}
			</select>
		</div>
	{/if}

	{#if node.type === 'blank'}
		<p class="muted">Choose a type above to configure this step.</p>
	{:else if node.type === 'line'}
		<div class="field">
			<label>Speaker</label>
			<select
				value={node.data.speaker ?? ''}
				onchange={(e) => {
					const speaker = (e.currentTarget as HTMLSelectElement).value;
					const char = characters.find((c) => c.id === speaker);
					updateData({
						speaker,
						characterState: char?.defaultStateId ?? '',
						portraitPath: '',
					});
				}}
			>
				<option value="">—</option>
				{#each characters as c}
					<option value={c.id}>{c.displayName}</option>
				{/each}
			</select>
		</div>
		{#if speakerChar}
			<div class="field">
				<label>Display state</label>
				<select
					value={stateOptions.some((s) => s.id === node.data.characterState)
						? node.data.characterState
						: ''}
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						if (v) updateData({ characterState: v });
					}}
				>
					{#each stateOptions as st}
						<option value={st.id}>{st.label} ({st.id})</option>
					{/each}
				</select>
			</div>
			{#if portraitPreview}
				<p class="hint">Resolved portrait: <code>{portraitPreview}</code></p>
			{/if}
		{/if}
		<div class="field">
			<label>Text</label>
			<textarea
				value={node.data.text ?? ''}
				oninput={(e) => updateData({ text: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="4"
			></textarea>
		</div>
	{:else if node.type === 'choice'}
		<p class="hint">
			Each path checks global state conditions, then continues to the connected step. Leave
			conditions empty for a fallback path.
		</p>
		{#each node.data.options ?? [] as opt, i}
			<div class="option-card">
				<div class="option-head">
					<label>Path {i + 1}</label>
					<button
						type="button"
						class="btn btn-danger btn-sm"
						disabled={optionCount <= 1}
						title={optionCount <= 1 ? 'A condition needs at least one path' : 'Remove path'}
						onclick={() => removeOption(opt.id)}
					>
						Remove
					</button>
				</div>
				<div class="field">
					<label for={`path-label-${opt.id}`}>Label (optional)</label>
					<input
						id={`path-label-${opt.id}`}
						value={opt.text}
						placeholder="e.g. Has met bartender"
						oninput={(e) => {
							const options = [...(node!.data.options ?? [])];
							options[i] = { ...opt, text: (e.currentTarget as HTMLInputElement).value };
							updateData({ options });
						}}
					/>
				</div>
				<div class="field">
					<span class="field-label">When state matches</span>
					<ConditionEditor
						conditions={opt.conditions ?? []}
						properties={gameStateProperties}
						onchange={(conditions) => updateOptionConditions(i, conditions)}
					/>
				</div>
				<div class="field">
					<label for={`path-target-${opt.id}`}>Then go to</label>
					<select
						id={`path-target-${opt.id}`}
						value={branchTarget(opt.id)}
						onchange={(e) =>
							onSetBranchTarget(
								node!.id,
								opt.id,
								(e.currentTarget as HTMLSelectElement).value,
							)}
					>
						<option value="">—</option>
						{#each branchTargets as id}
							<option value={id}>{id}</option>
						{/each}
					</select>
				</div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={addOption}>Add path</button>
	{:else if node.type === 'condition'}
		<p class="warn-box">
			This deprecated true/false condition node is no longer supported. Change its type to
			<strong>Condition</strong> and recreate paths with state checks, or delete it.
		</p>
	{:else if node.type === 'set_var'}
		<p class="hint">Set game state in the graph; wire your Godot handler via <code>run_command</code>.</p>
		<div class="field">
			<label>JSON ops (setOps array)</label>
			<textarea
				value={JSON.stringify(node.data.setOps ?? [], null, 2)}
				onchange={(e) => {
					try {
						updateData({ setOps: JSON.parse((e.currentTarget as HTMLTextAreaElement).value) });
					} catch {
						/* ignore */
					}
				}}
				rows="6"
			></textarea>
		</div>
	{:else if node.type === 'jump'}
		<div class="field">
			<label>Target scene</label>
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
		<p class="hint">Staging note for blocking, movement, and emotion — not exported to Godot.</p>
		<div class="field">
			<label>What happens on stage?</label>
			<textarea
				value={node.data.directionText ?? ''}
				oninput={(e) =>
					updateData({ directionText: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="5"
				placeholder="e.g. John looks mournfully at Cassie. The door creaks open."
			></textarea>
		</div>
	{:else if node.type === 'entry'}
		<p class="muted">Scene starts here. Connect from this node to the first step.</p>
	{:else if node.type === 'end'}
		<p class="muted">End of this branch.</p>
	{/if}

	{#if node.type !== 'entry'}
		<div class="inspector-actions">
			<button type="button" class="btn btn-danger" onclick={ondelete}>Delete node</button>
		</div>
	{/if}
{/if}

{#snippet BranchEdgeList(nodeEdges: GraphEdge[], branchLabel: (e: GraphEdge) => string, updateEdge: (id: string, patch: Partial<GraphEdge['data']>) => void)}
	<div class="branch-edges">
		<h4>Branch wiring</h4>
		{#each nodeEdges as edge}
			<div class="edge-card">
				<strong>{branchLabel(edge)}</strong>
				<span class="muted">→ {edge.target}</span>
				<label class="check">
					<input
						type="checkbox"
						checked={edge.data?.forceUse ?? false}
						onchange={(e) =>
							updateEdge(edge.id, {
								forceUse: (e.currentTarget as HTMLInputElement).checked,
							})}
					/>
					Just use this branch (force at export, suppress unused-branch warnings)
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={edge.data?.ignoreUnusedWarning ?? false}
						onchange={(e) =>
							updateEdge(edge.id, {
								ignoreUnusedWarning: (e.currentTarget as HTMLInputElement).checked,
							})}
					/>
					Opt out of unused-branch warning for alternates
				</label>
			</div>
		{/each}
	</div>
{/snippet}

<style>
	h3 {
		font-size: 0.95rem;
		margin-bottom: 1rem;
	}

	h4 {
		font-size: 0.85rem;
		margin: 1rem 0 0.5rem;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.field-label {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
		color: var(--text-muted);
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.warn {
		color: var(--warning);
		font-size: 0.8rem;
		margin: 0.25rem 0 0;
	}

	.warn-box {
		padding: 0.5rem;
		border: 1px solid var(--warning);
		border-radius: var(--radius);
	}

	.option-card,
	.edge-card {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.option-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	.option-head label {
		margin: 0;
	}

	.btn-sm {
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
	}

	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 0.35rem;
	}

	.inspector-actions {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
