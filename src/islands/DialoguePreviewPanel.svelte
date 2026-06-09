<script lang="ts">
import { portraitPreviewUrl } from '../lib/characters';
import {
	advanceDialogue,
	createDialoguePlayer,
	type DialoguePlayer,
	type DialogueStep,
} from '../lib/playtest/dialoguePlayer';
import {
	beginSceneDialogue,
	continueSceneDialogue,
	createSequencePlayer,
	getSequenceStep,
	type SequencePlayer,
} from '../lib/playtest/sequencePlayer';
import type { Character } from '../lib/schema/characters';
import type { DialogGraph } from '../lib/schema/graph';
import type { FlowGraph } from '../lib/schema/flow';
import type { GameStateProperty } from '../lib/schema/gameState';

interface ScenePreviewProps {
	mode: 'scene';
	graph: DialogGraph;
	characters: Character[];
	title?: string;
}

interface SequencePreviewProps {
	mode: 'sequence';
	flow: FlowGraph;
	dialogs: Record<string, DialogGraph>;
	characters: Character[];
	gameStateProperties?: GameStateProperty[];
	title?: string;
}

type Props = (ScenePreviewProps | SequencePreviewProps) & {
	slug: string;
	open: boolean;
	onclose: () => void;
};

let props: Props = $props();

let dialogPlayer = $state<DialoguePlayer | null>(null);
let sequencePlayer = $state<SequencePlayer | null>(null);
let currentStep = $state<DialogueStep | null>(null);
let history = $state<{ speaker?: string; text: string; kind: 'line' | 'direction' }[]>([]);
let status = $state('');

const title = $derived(props.title ?? (props.mode === 'scene' ? props.graph.displayName : props.flow.displayName));

function reset() {
	history = [];
	status = '';
	currentStep = null;
	if (props.mode === 'scene') {
		dialogPlayer = createDialoguePlayer(props.graph, props.characters);
		sequencePlayer = null;
		const result = advanceDialogue(dialogPlayer);
		dialogPlayer = result.player;
		currentStep = result.step;
		return;
	}
	sequencePlayer = createSequencePlayer(
		props.flow,
		props.dialogs,
		props.characters,
		props.gameStateProperties ?? [],
	);
	dialogPlayer = null;
	startNextSequenceBeat();
}

function startNextSequenceBeat() {
	if (!sequencePlayer) return;
	const seqStep = getSequenceStep(sequencePlayer);
	if (!seqStep) {
		status = 'Sequence finished';
		return;
	}
	if (seqStep.kind === 'end') {
		status = 'Sequence finished';
		sequencePlayer = { ...sequencePlayer, finished: true };
		return;
	}
	if (seqStep.kind === 'branch') {
		currentStep = null;
		status = `Branch: ${seqStep.label}`;
		return;
	}
	if (seqStep.kind === 'scene') {
		status = `Scene: ${seqStep.label}`;
		const begun = beginSceneDialogue(sequencePlayer, props.gameStateProperties ?? []);
		sequencePlayer = begun.player;
		dialogPlayer = begun.player.dialogPlayer;
		currentStep = begun.step;
	}
}

function pushHistory(step: DialogueStep) {
	if (step.kind === 'line') {
		history = [...history, { kind: 'line', speaker: step.speaker, text: step.text }];
	} else if (step.kind === 'direction') {
		history = [...history, { kind: 'direction', text: step.text }];
	}
}

function continuePlay(choiceId?: string) {
	if (props.mode === 'scene' && dialogPlayer) {
		if (currentStep && (currentStep.kind === 'line' || currentStep.kind === 'direction')) {
			pushHistory(currentStep);
		}
		const result = advanceDialogue(dialogPlayer, choiceId);
		dialogPlayer = result.player;
		currentStep = result.step;
		if (result.player.finished) status = 'Scene finished';
		return;
	}

	if (props.mode === 'sequence' && sequencePlayer) {
		if (currentStep && (currentStep.kind === 'line' || currentStep.kind === 'direction')) {
			pushHistory(currentStep);
		}
		const result = continueSceneDialogue(sequencePlayer, choiceId);
		sequencePlayer = result.player;
		dialogPlayer = result.player.dialogPlayer;
		currentStep = result.step;
		if (result.sceneFinished) {
			startNextSequenceBeat();
		} else if (result.player.finished) {
			status = 'Sequence finished';
		}
	}
}

function pickBranch(optionId: string) {
	if (!sequencePlayer) return;
	sequencePlayer = {
		...sequencePlayer,
		flowNodeId:
			sequencePlayer.flow.edges.find(
				(e) => e.source === sequencePlayer?.flowNodeId && e.sourceHandle === optionId,
			)?.target ?? sequencePlayer.flowNodeId,
	};
	status = '';
	startNextSequenceBeat();
}

function speakerName(id: string): string {
	return props.characters.find((c) => c.id === id)?.displayName || id;
}

function portraitFor(speaker: string, stateId?: string): string | null {
	const char = props.characters.find((c) => c.id === speaker);
	if (!char) return null;
	const path = stateId
		? char.states.find((s) => s.id === stateId)?.portraitPath || char.portraitPath
		: char.portraitPath;
	return portraitPreviewUrl(props.slug, path);
}

$effect(() => {
	if (props.open) reset();
});
</script>

{#if props.open}
	<dialog class="preview-dialog" open>
		<form method="dialog" class="preview-panel" onsubmit={(e) => e.preventDefault()}>
			<header class="preview-header">
				<h2>Preview — {title}</h2>
				<button type="button" class="btn" onclick={() => props.onclose()}>Close</button>
			</header>

			<div class="preview-body">
				<div class="history">
					{#each history as item}
						{#if item.kind === 'direction'}
							<p class="direction">{item.text}</p>
						{:else}
							<div class="line">
								<strong>{speakerName(item.speaker ?? '')}</strong>
								<p>{item.text}</p>
							</div>
						{/if}
					{/each}
				</div>

				{#if currentStep?.kind === 'line'}
					{@const portrait = portraitFor(currentStep.speaker, currentStep.characterState)}
					<div class="beat line-beat">
						{#if portrait}
							<img class="portrait" src={portrait} alt="" />
						{/if}
						<div>
							<strong>{speakerName(currentStep.speaker)}</strong>
							<p>{currentStep.text}</p>
						</div>
					</div>
				{:else if currentStep?.kind === 'direction'}
					<div class="beat direction-beat">
						<p>{currentStep.text}</p>
					</div>
				{:else if currentStep?.kind === 'choice'}
					<div class="beat choice-beat">
						<p class="choice-label">Choose:</p>
						<div class="choice-options">
							{#each currentStep.options as opt}
								<button type="button" class="btn" onclick={() => continuePlay(opt.id)}>
									{opt.text}
								</button>
							{/each}
						</div>
					</div>
				{:else if sequencePlayer && getSequenceStep(sequencePlayer)?.kind === 'branch'}
					{@const branch = getSequenceStep(sequencePlayer)}
					{#if branch && branch.kind === 'branch'}
						<div class="beat choice-beat">
							<p class="choice-label">{branch.label}</p>
							<div class="choice-options">
								{#each branch.options as opt}
									<button type="button" class="btn" onclick={() => pickBranch(opt.id)}>
										{opt.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<p class="status">{status || 'Ready'}</p>
				{/if}
			</div>

			<footer class="preview-footer">
				<button type="button" class="btn" onclick={() => reset()}>Restart</button>
				{#if currentStep?.kind === 'line' || currentStep?.kind === 'direction'}
					<button type="button" class="btn btn-primary" onclick={() => continuePlay()}>
						Continue
					</button>
				{/if}
			</footer>
		</form>
	</dialog>
{/if}

<style>
	.preview-dialog {
		border: none;
		padding: 0;
		background: transparent;
		max-width: min(720px, 96vw);
		width: 100%;
	}

	.preview-panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		max-height: 85vh;
	}

	.preview-header,
	.preview-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.preview-footer {
		border-bottom: none;
		border-top: 1px solid var(--border);
		justify-content: flex-end;
	}

	.preview-header h2 {
		margin: 0;
		font-size: 1rem;
	}

	.preview-body {
		padding: 1rem;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-height: 240px;
	}

	.history .direction {
		font-style: italic;
		color: var(--text-muted);
	}

	.line-beat {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.portrait {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border-radius: var(--radius);
	}

	.direction-beat {
		font-style: italic;
		color: var(--text-muted);
	}

	.choice-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: stretch;
	}

	.status {
		color: var(--text-muted);
	}
</style>
