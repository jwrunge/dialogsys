<script lang="ts">
import { Handle, type NodeProps, Position } from '@xyflow/svelte';
import { getContext } from 'svelte';
import { characterById } from '../lib/characters';
import { DIALOG_CHARACTERS_KEY, type DialogCharactersContext } from '../lib/graph/dialogContext';

let { data, type }: NodeProps = $props();

const getCharacters = getContext<DialogCharactersContext | undefined>(DIALOG_CHARACTERS_KEY);
const characters = $derived(getCharacters?.() ?? []);

const labels: Record<string, string> = {
	entry: 'Entry',
	blank: 'New step',
	line: 'Line',
	choice: 'Condition',
	condition: 'Condition (old)',
	set_var: 'Set var',
	jump: 'Jump',
	direction: 'Direction',
	end: 'End',
};

const colors: Record<string, string> = {
	entry: '#5fd49a',
	blank: '#9aa3b8',
	line: '#6c9eff',
	choice: '#e8b84a',
	condition: '#c792ea',
	set_var: '#f07178',
	jump: '#89ddff',
	direction: '#9aa3b8',
	end: '#f07178',
};

const nodeType = $derived((type as string) ?? 'line');

const title = $derived.by(() => {
	if (data?.label) return String(data.label);
	switch (nodeType) {
		case 'line': {
			const speaker = data?.speaker as string | undefined;
			if (!speaker) return labels.line;
			return characterById(characters, speaker)?.displayName ?? speaker;
		}
		case 'direction': {
			const text = (data?.directionText as string)?.trim();
			return text ? text.slice(0, 40) : labels.direction;
		}
		case 'condition':
			return labels.condition;
		case 'choice': {
			const first = (data?.options as { text?: string }[] | undefined)?.[0]?.text?.trim();
			return first || labels.choice;
		}
		case 'set_var':
			return labels.set_var;
		case 'jump':
			return labels.jump;
		default:
			return labels[nodeType] ?? nodeType;
	}
});

const subtitle = $derived.by(() => {
	if (nodeType === 'line') {
		const parts = [
			data?.characterState ? `[${data.characterState}]` : '',
			(data?.text as string)?.slice(0, 36) || '',
		].filter(Boolean);
		return parts.join(' ');
	}
	if (nodeType === 'choice') {
		const count = (data?.options as unknown[])?.length ?? 0;
		return `${count} path${count === 1 ? '' : 's'}`;
	}
	if (nodeType === 'direction') {
		const text = (data?.directionText as string)?.trim() ?? '';
		if (!text || text.length <= 40) return '';
		return `${text.slice(40, 76)}…`;
	}
	return '';
});
</script>

<div class="dialog-node" style="--accent-color: {colors[nodeType] ?? '#6c9eff'}">
	{#if nodeType !== 'entry'}
		<Handle type="target" position={Position.Top} />
	{/if}
	<span class="type" data-transmut="include">{labels[nodeType] ?? nodeType}</span>
	<div data-transmut-skip>
		<strong>{title}</strong>
		{#if subtitle}
			<p>{subtitle}{subtitle.length >= 40 ? '…' : ''}</p>
		{/if}
	</div>
	{#if nodeType === 'choice'}
		{#each (data?.options ?? []) as opt, i (opt.id ?? i)}
			<Handle
				type="source"
				position={Position.Bottom}
				id={opt.id}
				style="left: {20 + i * (60 / Math.max((data?.options ?? []).length, 1))}%"
			/>
		{/each}
	{:else if nodeType === 'condition'}
		<Handle type="source" position={Position.Bottom} id="true" style="left: 30%" />
		<Handle type="source" position={Position.Bottom} id="false" style="left: 70%" />
	{:else if nodeType !== 'end'}
		<Handle type="source" position={Position.Bottom} />
	{/if}
</div>

<style>
	.dialog-node {
		min-width: 140px;
		max-width: 200px;
		padding: 0.5rem 0.65rem;
		background: var(--bg-elevated);
		border: 2px solid var(--accent-color);
		border-radius: var(--radius);
		font-size: 0.75rem;
		color: var(--text);
	}

	.type {
		display: block;
		font-size: 0.65rem;
		text-transform: uppercase;
		color: var(--accent-color);
		margin-bottom: 0.2rem;
	}

	strong {
		display: block;
		font-size: 0.8rem;
	}

	p {
		margin: 0.25rem 0 0;
		color: var(--text-muted);
		font-size: 0.7rem;
	}
</style>
