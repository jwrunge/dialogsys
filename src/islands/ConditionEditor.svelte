<script lang="ts">
import { atomsToConditions, conditionAtoms } from '../lib/conditions';
import type { ConditionAtom, ConditionGroup } from '../lib/schema/conditions';
import { type GameStateProperty, initialValueForProperty } from '../lib/schema/gameState';

interface Props {
	conditions: ConditionGroup[];
	properties: GameStateProperty[];
	onchange: (conditions: ConditionGroup[]) => void;
}

let { conditions, properties, onchange }: Props = $props();

const atoms = $derived(conditionAtoms(conditions));

function emit(next: ConditionAtom[]) {
	onchange(atomsToConditions(next));
}

function addAtom() {
	const prop = properties[0];
	if (!prop) return;
	emit([
		...atoms,
		{
			scope: 'global',
			var: prop.id,
			op: 'eq',
			value: initialValueForProperty(prop),
		},
	]);
}

function updateAtom(index: number, patch: Partial<ConditionAtom>) {
	const next = atoms.map((atom, i) => (i === index ? { ...atom, ...patch } : atom));
	emit(next);
}

function removeAtom(index: number) {
	emit(atoms.filter((_, i) => i !== index));
}

function onVarChange(index: number, varId: string) {
	const prop = properties.find((p) => p.id === varId);
	updateAtom(index, {
		var: varId,
		value: prop ? initialValueForProperty(prop) : '',
	});
}
</script>

<div class="condition-editor" data-transmut="include">
	{#if properties.length === 0}
		<p class="muted">Define global state properties on the State page first.</p>
	{:else if atoms.length === 0}
		<p class="muted">No conditions — this path is only taken when selected as the default fallback.</p>
	{:else}
		{#each atoms as atom, i (i)}
			{@const prop = properties.find((p) => p.id === atom.var)}
			<div class="condition-row">
				<select
					value={atom.var}
					onchange={(e) => onVarChange(i, (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each properties as p (p.id)}
						<option value={p.id}>{p.label}</option>
					{/each}
				</select>
				<select
					value={atom.op}
					onchange={(e) =>
						updateAtom(i, { op: (e.currentTarget as HTMLSelectElement).value as ConditionAtom['op'] })}
				>
					<option value="eq">=</option>
					<option value="neq">≠</option>
					<option value="gt">&gt;</option>
					<option value="gte">≥</option>
					<option value="lt">&lt;</option>
					<option value="lte">≤</option>
				</select>
				{#if prop?.type === 'boolean'}
					<select
						value={String(atom.value)}
						onchange={(e) =>
							updateAtom(i, {
								value: (e.currentTarget as HTMLSelectElement).value === 'true',
							})}
					>
						<option value="true">true</option>
						<option value="false">false</option>
					</select>
				{:else if prop?.type === 'number'}
					<input
						type="number"
						value={Number(atom.value)}
						oninput={(e) =>
							updateAtom(i, {
								value: Number((e.currentTarget as HTMLInputElement).value),
							})}
					/>
				{:else}
					<input
						type="text"
						value={String(atom.value)}
						oninput={(e) =>
							updateAtom(i, { value: (e.currentTarget as HTMLInputElement).value })}
					/>
				{/if}
				<button type="button" class="btn btn-sm" onclick={() => removeAtom(i)}>Remove</button>
			</div>
		{/each}
	{/if}
	{#if properties.length > 0}
		<button type="button" class="btn btn-sm" onclick={addAtom}>Add condition</button>
	{/if}
</div>

<style>
	.condition-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.condition-row {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		gap: 0.35rem;
		align-items: center;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.btn-sm {
		padding: 0.2rem 0.45rem;
		font-size: 0.75rem;
	}
</style>
