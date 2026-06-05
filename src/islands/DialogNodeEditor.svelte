<script lang="ts">
	import type { Character } from '../lib/schema/characters';
	import type { GraphNode, GraphNodeData, GraphEdge, ChoiceOption } from '../lib/schema/graph';
	import { resolvePortraitPath } from '../lib/characters';
	import { NODE_TYPE_OPTIONS } from '../lib/graph/nodeFactory';
	import { nanoid } from 'nanoid';

	interface Props {
		node: GraphNode;
		edges: GraphEdge[];
		nodes: GraphNode[];
		characters: Character[];
		dialogIds: string[];
		onchange: (node: GraphNode) => void;
		onedgechange: (edge: GraphEdge) => void;
		onSetBranchTarget: (sourceId: string, handle: string, targetId: string) => void;
	}

	let { node, edges, nodes, characters, dialogIds, onchange, onedgechange, onSetBranchTarget }: Props =
		$props();

	const branchTargets = $derived(
		nodes.filter((n) => n.id !== node.id && n.type !== 'entry').map((n) => n.id),
	);

	const speakerChar = $derived(characters.find((c) => c.id === node.data.speaker));

	const stateOptions = $derived(speakerChar?.states ?? []);

	const portraitPreview = $derived(
		resolvePortraitPath(
			speakerChar,
			node.data.characterState || speakerChar?.defaultStateId,
			node.data.portraitPath,
		),
	);

	const nodeEdges = $derived(edges.filter((e) => e.source === node.id));

	function branchTarget(handle: string): string {
		return (
			edges.find(
				(e) =>
					e.source === node.id &&
					(e.sourceHandle === handle || e.data?.branch === handle),
			)?.target ?? ''
		);
	}

	function updateData(patch: Partial<GraphNodeData>) {
		onchange({ ...node, data: { ...node.data, ...patch } });
	}

	function setType(type: string) {
		onchange({ ...node, type });
	}

	function updateEdge(edgeId: string, patch: Partial<GraphEdge['data']>) {
		const edge = edges.find((e) => e.id === edgeId);
		if (!edge) return;
		onedgechange({ ...edge, data: { ...edge.data, ...patch } });
	}

	function addOption() {
		const options: ChoiceOption[] = [
			...(node.data.options ?? []),
			{ id: nanoid(8), text: 'New option', conditions: [] },
		];
		updateData({ options });
	}

	function branchLabel(edge: GraphEdge): string {
		if (edge.sourceHandle === 'true' || edge.data?.branch === 'true') return 'True branch';
		if (edge.sourceHandle === 'false' || edge.data?.branch === 'false') return 'False branch';
		const opt = node.data.options?.find((o) => o.id === edge.sourceHandle);
		return opt ? `Option: ${opt.text}` : `Branch (${edge.sourceHandle ?? 'default'})`;
	}
</script>

<div class="node-editor">
	<div class="field">
		<label for="node-type-{node.id}">Type</label>
		<select
			id="node-type-{node.id}"
			value={node.type}
			onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value)}
		>
			{#each NODE_TYPE_OPTIONS as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
			{#if node.type === 'entry'}
				<option value="entry">Start</option>
			{/if}
		</select>
	</div>

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
				<p class="hint">Portrait: <code>{portraitPreview}</code></p>
			{/if}
		{/if}
		<div class="field">
			<label>Text</label>
			<textarea
				value={node.data.text ?? ''}
				oninput={(e) => updateData({ text: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="3"
			></textarea>
		</div>
	{:else if node.type === 'choice'}
		{#each node.data.options ?? [] as opt, i}
			<div class="option-card">
				<div class="field">
					<label>Option {i + 1}</label>
					<input
						value={opt.text}
						oninput={(e) => {
							const options = [...(node.data.options ?? [])];
							options[i] = { ...opt, text: (e.currentTarget as HTMLInputElement).value };
							updateData({ options });
						}}
					/>
				</div>
				<div class="field">
					<label>Then go to</label>
					<select
						value={branchTarget(opt.id)}
						onchange={(e) =>
							onSetBranchTarget(node.id, opt.id, (e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">—</option>
						{#each branchTargets as id}
							<option value={id}>{id}</option>
						{/each}
					</select>
				</div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={addOption}>Add option</button>
	{:else if node.type === 'condition'}
		<div class="field">
			<label>Scope</label>
			<select
				value={node.data.branchScope ?? 'global'}
				onchange={(e) =>
					updateData({
						branchScope: (e.currentTarget as HTMLSelectElement).value as 'global' | 'character',
					})}
			>
				<option value="global">global</option>
				<option value="character">character</option>
			</select>
		</div>
		{#if node.data.branchScope === 'character'}
			<div class="field">
				<label>Character</label>
				<select
					value={node.data.branchCharacterId ?? ''}
					onchange={(e) =>
						updateData({ branchCharacterId: (e.currentTarget as HTMLSelectElement).value })}
				>
					<option value="">—</option>
					{#each characters as c}
						<option value={c.id}>{c.id}</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="field">
			<label>Variable</label>
			<input
				value={node.data.branchVar ?? ''}
				oninput={(e) => updateData({ branchVar: (e.currentTarget as HTMLInputElement).value })}
			/>
		</div>
		<div class="field">
			<label>True branch →</label>
			<select
				value={branchTarget('true')}
				onchange={(e) =>
					onSetBranchTarget(node.id, 'true', (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">—</option>
				{#each branchTargets as id}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>False branch →</label>
			<select
				value={branchTarget('false')}
				onchange={(e) =>
					onSetBranchTarget(node.id, 'false', (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">—</option>
				{#each branchTargets as id}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</div>
	{:else if node.type === 'set_var'}
		<div class="field">
			<label>JSON ops (setOps)</label>
			<textarea
				value={JSON.stringify(node.data.setOps ?? [], null, 2)}
				onchange={(e) => {
					try {
						updateData({ setOps: JSON.parse((e.currentTarget as HTMLTextAreaElement).value) });
					} catch {
						/* ignore */
					}
				}}
				rows="4"
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
		<p class="hint">Staging note for blocking, movement, and emotion — not exported to Godot.</p>
		<div class="field">
			<label>What happens on stage?</label>
			<textarea
				value={node.data.directionText ?? ''}
				oninput={(e) =>
					updateData({ directionText: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="3"
				placeholder="e.g. John looks mournfully at Cassie. The door creaks open."
			></textarea>
		</div>
	{:else if node.type === 'entry'}
		<p class="muted">Dialog begins here.</p>
	{:else if node.type === 'end'}
		<p class="muted">End of this branch.</p>
	{/if}
</div>

<style>
	.node-editor {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid var(--border);
		background: var(--bg);
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0;
	}

	code {
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.option-card {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}
</style>
