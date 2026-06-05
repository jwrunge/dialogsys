<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { formatConditions } from '../lib/conditions';
	import type { FlowBranchOption, FlowFirstMeeting } from '../lib/schema/flow';

	let { data, type }: NodeProps = $props();

	const nodeType = $derived((type as string) ?? 'scene');

	const labels: Record<string, string> = {
		start: 'Start',
		scene: 'Scene',
		branch: 'Branch',
		end: 'End',
	};

	const colors: Record<string, string> = {
		start: '#5fd49a',
		scene: '#6c9eff',
		branch: '#e8b84a',
		end: '#f07178',
	};

	const title = $derived(
		(data?.label as string) ||
			(data?.dialogId as string) ||
			labels[nodeType] ||
			nodeType,
	);

	const subtitle = $derived.by(() => {
		if (nodeType === 'scene') {
			const id = data?.dialogId as string | undefined;
			return id ? `Dialog: ${id}` : 'No dialog assigned';
		}
		if (nodeType === 'branch') {
			const opts = (data?.options as FlowBranchOption[]) ?? [];
			const labeled = opts
				.map((o) => {
					if (o.isDefault) return `${o.label}: default`;
					const when = formatConditions(o.conditions);
					return when ? `${o.label}: ${when}` : o.label;
				})
				.join(' · ');
			return labeled || `${opts.length} path${opts.length === 1 ? '' : 's'}`;
		}
		return '';
	});
</script>

<div
	class="flow-node"
	class:unassigned={nodeType === 'scene' && !data?.dialogId}
	style="--accent-color: {colors[nodeType] ?? '#6c9eff'}"
>
	{#if nodeType !== 'start'}
		<Handle type="target" position={Position.Top} />
	{/if}
	<span class="type">{labels[nodeType] ?? nodeType}</span>
	<strong>{title}</strong>
	{#if subtitle}
		<p>{subtitle}</p>
	{/if}
	{#if nodeType === 'scene'}
		{#each (data?.firstMeetings as FlowFirstMeeting[] | undefined) ?? [] as meeting (meeting.characterId)}
			<p class="meeting">First meeting: {meeting.displayName}</p>
		{/each}
	{/if}
	{#if nodeType === 'branch'}
		{#each (data?.options ?? []) as opt, i (opt.id ?? i)}
			<Handle
				type="source"
				position={Position.Bottom}
				id={opt.id}
				style="left: {15 + i * (70 / Math.max((data?.options ?? []).length, 1))}%"
			/>
		{/each}
	{:else if nodeType !== 'end'}
		<Handle type="source" position={Position.Bottom} />
	{/if}
</div>

<style>
	.flow-node {
		min-width: 150px;
		max-width: 220px;
		padding: 0.55rem 0.7rem;
		background: var(--bg-elevated);
		border: 2px solid var(--accent-color);
		border-radius: var(--radius);
		font-size: 0.85rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
	}

	.flow-node.unassigned {
		border-style: dashed;
		opacity: 0.9;
	}

	.type {
		display: block;
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent-color);
		margin-bottom: 0.2rem;
	}

	strong {
		display: block;
		font-size: 0.9rem;
		line-height: 1.3;
	}

	p {
		margin: 0.25rem 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.meeting {
		color: #9ec5ff;
		font-style: italic;
	}
</style>
