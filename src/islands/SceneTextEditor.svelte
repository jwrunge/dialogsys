<script lang="ts">
import { nanoid } from 'nanoid';
import type { Character } from '../lib/schema/characters';
import type { DialogGraph } from '../lib/schema/graph';
import { graphToSceneTextBlocks, type SceneTextBlock, type SceneTextChoiceBlock } from '../lib/writer/sceneText';
import { isProjectReadOnly } from '../lib/client/project-access';

interface Props {
	graph: DialogGraph;
	characters: Character[];
	revision: string;
	onchange: (blocks: SceneTextBlock[]) => void;
}

let { graph, characters, revision, onchange }: Props = $props();

let blocks = $state<SceneTextBlock[]>([]);
let activeChoiceTab = $state<Record<string, number>>({});

function syncFromGraph() {
	blocks = graphToSceneTextBlocks(graph, characters);
}

function emitChange(nextBlocks: SceneTextBlock[]) {
	blocks = nextBlocks;
	onchange(nextBlocks);
}

function updateLine(index: number, value: string) {
	const block = blocks[index];
	if (block?.type !== 'line') return;
	const match = value.match(/^([^:\n]+):\s*(.*)$/s);
	if (!match) {
		const next = [...blocks];
		next[index] = { type: 'direction', nodeId: block.nodeId, text: value };
		emitChange(next);
		return;
	}
	const next = [...blocks];
	next[index] = {
		type: 'line',
		nodeId: block.nodeId,
		speaker: match[1]!.trim(),
		text: match[2] ?? '',
	};
	emitChange(next);
}

function lineValue(block: Extract<SceneTextBlock, { type: 'line' }>): string {
	return `${block.speaker}: ${block.text}`;
}

function updateDirection(index: number, text: string) {
	const next = [...blocks];
	next[index] = { type: 'direction', nodeId: blocks[index]?.nodeId, text };
	emitChange(next);
}

function updateChoiceOption(blockIndex: number, optionIndex: number, text: string) {
	const block = blocks[blockIndex];
	if (block?.type !== 'choice') return;
	const next = [...blocks];
	const options = block.options.map((opt, i) => (i === optionIndex ? { ...opt, text } : opt));
	next[blockIndex] = { ...block, options };
	emitChange(next);
}

function addDirection() {
	emitChange([...blocks, { type: 'direction', text: '' }]);
}

function addLine() {
	emitChange([...blocks, { type: 'line', speaker: characters[0]?.displayName ?? 'Character', text: '' }]);
}

function addChoice() {
	const id = `choice_${nanoid(6)}`;
	emitChange([
		...blocks,
		{
			type: 'choice',
			nodeId: id,
			options: [
				{ id: nanoid(8), text: 'Option A' },
				{ id: nanoid(8), text: 'Option B' },
			],
		},
	]);
	activeChoiceTab = { ...activeChoiceTab, [id]: 0 };
}

function addChoiceOption(blockIndex: number) {
	const block = blocks[blockIndex];
	if (block?.type !== 'choice') return;
	const next = [...blocks];
	next[blockIndex] = {
		...block,
		options: [...block.options, { id: nanoid(8), text: `Option ${block.options.length + 1}` }],
	};
	emitChange(next);
}

function choiceKey(block: SceneTextChoiceBlock): string {
	return block.nodeId ?? `choice-${block.options.map((o) => o.id).join('-')}`;
}

$effect(() => {
	revision;
	characters;
	syncFromGraph();
});
</script>

<div class="scene-text-editor" data-transmut="include">
	<div class="toolbar">
		<button type="button" class="btn" disabled={isProjectReadOnly()} onclick={addDirection}>
			Add direction
		</button>
		<button type="button" class="btn" disabled={isProjectReadOnly()} onclick={addLine}>Add line</button>
		<button type="button" class="btn" disabled={isProjectReadOnly()} onclick={addChoice}>
			Add choice
		</button>
	</div>

	<p class="hint">
		Lines use <code>Character: dialogue</code>. Plain lines are stage direction. Choices use tabs below.
	</p>

	<div class="document">
		{#each blocks as block, index}
			{#if block.type === 'line'}
				<textarea
					class="doc-line"
					rows="2"
					value={lineValue(block)}
					disabled={isProjectReadOnly()}
					oninput={(e) => updateLine(index, e.currentTarget.value)}
				></textarea>
			{:else if block.type === 'direction'}
				<textarea
					class="doc-direction"
					rows="2"
					value={block.text}
					disabled={isProjectReadOnly()}
					oninput={(e) => updateDirection(index, e.currentTarget.value)}
				></textarea>
			{:else if block.type === 'choice'}
				{@const key = choiceKey(block)}
				{@const tab = activeChoiceTab[key] ?? 0}
				<div class="choice-block">
					<div class="choice-tabs">
						{#each block.options as opt, optionIndex}
							<button
								type="button"
								class="choice-tab"
								class:active={tab === optionIndex}
								onclick={() => {
									activeChoiceTab = { ...activeChoiceTab, [key]: optionIndex };
								}}
							>
								{opt.text.trim() || `Option ${optionIndex + 1}`}
							</button>
						{/each}
						{#if !isProjectReadOnly()}
							<button type="button" class="choice-tab add" onclick={() => addChoiceOption(index)}>
								+
							</button>
						{/if}
					</div>
					{#each block.options as opt, optionIndex}
						{#if tab === optionIndex}
							<textarea
								class="doc-choice"
								rows="2"
								value={opt.text}
								disabled={isProjectReadOnly()}
								oninput={(e) => updateChoiceOption(index, optionIndex, e.currentTarget.value)}
							></textarea>
						{/if}
					{/each}
				</div>
			{:else if block.type === 'marker'}
				<div class="marker" data-transmut-skip>{block.label} (graph only)</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.scene-text-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 1rem;
		gap: 0.75rem;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.document {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	textarea {
		width: 100%;
		font: inherit;
		line-height: 1.5;
		border: 1px solid transparent;
		border-radius: var(--radius);
		padding: 0.5rem 0.65rem;
		resize: vertical;
		background: var(--bg);
	}

	textarea:focus {
		border-color: var(--border);
		outline: none;
	}

	.doc-direction {
		font-style: italic;
		color: var(--text-muted);
	}

	.choice-block {
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		padding: 0.5rem;
	}

	.choice-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.choice-tab {
		border: 1px solid var(--border);
		background: var(--bg);
		border-radius: 999px;
		padding: 0.2rem 0.65rem;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.choice-tab.active {
		background: var(--accent);
		color: var(--bg-elevated);
		border-color: var(--accent);
	}

	.choice-tab.add {
		min-width: 2rem;
	}

	.marker {
		font-size: 0.75rem;
		color: var(--text-muted);
		padding: 0.25rem 0.5rem;
		background: var(--bg);
		border-radius: var(--radius);
	}
</style>
