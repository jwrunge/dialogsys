<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	let { data, type }: NodeProps = $props();

	const labels: Record<string, string> = {
		entry: 'Entry',
		line: 'Line',
		choice: 'Choice',
		condition: 'Condition',
		set_var: 'Set var',
		jump: 'Jump',
		direction: 'Direction',
		end: 'End',
	};

	const colors: Record<string, string> = {
		entry: '#5fd49a',
		line: '#6c9eff',
		choice: '#e8b84a',
		condition: '#c792ea',
		set_var: '#f07178',
		jump: '#89ddff',
		direction: '#9aa3b8',
		end: '#f07178',
	};

	const nodeType = $derived((type as string) ?? 'line');
	const title = $derived(
		data?.label ||
			(data?.speaker ? `${data.speaker}` : '') ||
			labels[nodeType] ||
			nodeType,
	);
	const subtitle = $derived(
		nodeType === 'line'
			? (data?.text as string)?.slice(0, 40) || ''
			: nodeType === 'choice'
				? `${(data?.options as unknown[])?.length ?? 0} options`
				: '',
	);
</script>

<div class="dialog-node" style="--accent-color: {colors[nodeType] ?? '#6c9eff'}">
	{#if nodeType !== 'entry'}
		<Handle type="target" position={Position.Top} />
	{/if}
	<span class="type">{labels[nodeType] ?? nodeType}</span>
	<strong>{title}</strong>
	{#if subtitle}
		<p>{subtitle}{subtitle.length >= 40 ? '…' : ''}</p>
	{/if}
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
