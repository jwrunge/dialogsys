<script lang="ts">
	import type { Character } from '../lib/schema/characters';
	import type { GraphNode, GraphNodeData, GraphEdge, ChoiceOption } from '../lib/schema/graph';
	import { resolvePortraitPath } from '../lib/characters';
	import { nanoid } from 'nanoid';

	interface Props {
		node: GraphNode | null;
		edges: GraphEdge[];
		characters: Character[];
		dialogIds: string[];
		onchange: (node: GraphNode) => void;
		onedgechange: (edge: GraphEdge) => void;
	}

	let { node, edges, characters, dialogIds, onchange, onedgechange }: Props = $props();

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
			{ id: nanoid(8), text: 'New option', conditions: [] },
		];
		updateData({ options });
	}

	function branchLabel(edge: GraphEdge): string {
		if (edge.sourceHandle === 'true' || edge.data?.branch === 'true') return 'True branch';
		if (edge.sourceHandle === 'false' || edge.data?.branch === 'false') return 'False branch';
		const opt = node?.data.options?.find((o) => o.id === edge.sourceHandle);
		return opt ? `Option: ${opt.text}` : `Branch (${edge.sourceHandle ?? 'default'})`;
	}
</script>

{#if !node}
	<p class="muted">Select a node to edit.</p>
{:else}
	<h3>{node.type} <code>{node.id}</code></h3>

	{#if node.type === 'line'}
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
			<div class="field">
				<label>State id (type any id, e.g. panicked for Jane)</label>
				<input
					value={node.data.characterState ?? speakerChar.defaultStateId}
					oninput={(e) =>
						updateData({ characterState: (e.currentTarget as HTMLInputElement).value })}
				/>
				{#if node.data.characterState && !stateOptions.some((s) => s.id === node.data.characterState)}
					<p class="warn">
						"{node.data.characterState}" is not defined for {speakerChar.displayName} — see
						Issues.
					</p>
				{/if}
			</div>
			{#if portraitPreview}
				<p class="hint">Resolved portrait: <code>{portraitPreview}</code></p>
			{/if}
		{/if}
		<div class="field">
			<label>Portrait override (optional)</label>
			<input
				value={node.data.portraitPath ?? ''}
				oninput={(e) =>
					updateData({ portraitPath: (e.currentTarget as HTMLInputElement).value })}
				placeholder="Leave blank to use state portrait"
			/>
		</div>
		<div class="field">
			<label>Text</label>
			<textarea
				value={node.data.text ?? ''}
				oninput={(e) => updateData({ text: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="4"
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
		{#if nodeEdges.length > 0}
			<BranchEdgeList {nodeEdges} {branchLabel} {updateEdge} />
		{/if}
	{:else if node.type === 'condition'}
		<div class="field">
			<label>Force branch (ignore other path at export)</label>
			<select
				value={node.data.forceBranch ?? ''}
				onchange={(e) => {
					const v = (e.currentTarget as HTMLSelectElement).value;
					updateData({
						forceBranch: v === '' ? undefined : (v as 'true' | 'false'),
					});
				}}
			>
				<option value="">None (evaluate variable)</option>
				<option value="true">Always true branch</option>
				<option value="false">Always false branch</option>
			</select>
		</div>
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
				<label>Character ID</label>
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
		<BranchEdgeList {nodeEdges} {branchLabel} {updateEdge} />
	{:else if node.type === 'set_var'}
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
			<label>Direction text (staging — not exported)</label>
			<textarea
				value={node.data.directionText ?? ''}
				oninput={(e) =>
					updateData({ directionText: (e.currentTarget as HTMLTextAreaElement).value })}
				rows="5"
				placeholder="e.g. John looks mournfully at Cassie."
			></textarea>
		</div>
		<p class="hint">Use this for scene blocking in the graph. Player-facing lines use Line nodes.</p>
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

	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 0.35rem;
	}
</style>
