<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';
	import type { VariablesFile, VariableDef } from '../lib/schema/variables';
	import { nanoid } from 'nanoid';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	let data = $state<VariablesFile>({ global: [], perCharacter: [] });
	let status = $state<'loading' | 'saved' | 'error' | 'idle'>('loading');
	let message = $state('');

	async function load() {
		status = 'loading';
		message = '';
		try {
			data = await api<VariablesFile>(`/api/projects/${slug}/variables`);
			status = 'idle';
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	async function save() {
		status = 'loading';
		message = '';
		try {
			const payload = await api<VariablesFile>(`/api/projects/${slug}/variables`, {
				method: 'PUT',
				body: JSON.stringify(data),
			});
			data = payload;
			status = 'saved';
			message = 'Saved';
			setTimeout(() => {
				if (status === 'saved') status = 'idle';
			}, 2000);
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	function newVar(): VariableDef {
		return {
			id: `var_${nanoid(5).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
			type: 'int',
			default: 0,
			description: '',
		};
	}

	function addGlobal() {
		data = {
			...data,
			global: [...data.global, newVar()],
		};
	}

	function addPerCharacter() {
		data = {
			...data,
			perCharacter: [
				...data.perCharacter,
				{ characterId: '', vars: [newVar()] },
			],
		};
	}

	function removeGlobal(index: number) {
		data = {
			...data,
			global: data.global.filter((_, j) => j !== index),
		};
	}

	function removeGroup(groupIndex: number) {
		data = {
			...data,
			perCharacter: data.perCharacter.filter((_, j) => j !== groupIndex),
		};
	}

	function addVarToGroup(groupIndex: number) {
		data = {
			...data,
			perCharacter: data.perCharacter.map((group, gi) =>
				gi === groupIndex ? { ...group, vars: [...group.vars, newVar()] } : group,
			),
		};
	}

	function removeVarFromGroup(groupIndex: number, varIndex: number) {
		data = {
			...data,
			perCharacter: data.perCharacter.map((group, gi) =>
				gi === groupIndex
					? { ...group, vars: group.vars.filter((_, j) => j !== varIndex) }
					: group,
			),
		};
	}

	function updateGlobal(index: number, patch: Partial<VariableDef>) {
		data = {
			...data,
			global: data.global.map((v, i) => (i === index ? { ...v, ...patch } : v)),
		};
	}

	function updateGroupCharId(groupIndex: number, characterId: string) {
		data = {
			...data,
			perCharacter: data.perCharacter.map((g, gi) =>
				gi === groupIndex ? { ...g, characterId } : g,
			),
		};
	}

	function updateGroupVar(
		groupIndex: number,
		varIndex: number,
		patch: Partial<VariableDef>,
	) {
		data = {
			...data,
			perCharacter: data.perCharacter.map((group, gi) =>
				gi === groupIndex
					? {
							...group,
							vars: group.vars.map((v, vi) =>
								vi === varIndex ? { ...v, ...patch } : v,
							),
						}
					: group,
			),
		};
	}

	onMount(load);
</script>

<div class="toolbar">
	<button type="button" class="btn" onclick={addGlobal}>Add global variable</button>
	<button type="button" class="btn" onclick={addPerCharacter}>Add per-character group</button>
	<button type="button" class="btn btn-primary" onclick={save} disabled={status === 'loading'}>
		Save
	</button>
	<span class="status" class:saved={status === 'saved'} class:error={status === 'error'}>
		{message || (status === 'loading' ? 'Loading…' : '')}
	</span>
</div>

{#if status === 'error' && message}
	<p class="error-banner">{message}</p>
{/if}

<section>
	<h2>Global variables</h2>
	<p class="hint">Used in condition and set_var nodes for branching (e.g. quest_stage, met_bartender).</p>
	{#if data.global.length === 0}
		<p class="muted">No global variables. Click “Add global variable” above.</p>
	{/if}
	{#each data.global as v, i (v.id + i)}
		<div class="var-row">
			<input value={v.id} oninput={(e) => updateGlobal(i, { id: (e.currentTarget as HTMLInputElement).value })} placeholder="id" />
			<select
				value={v.type}
				onchange={(e) => {
					const type = (e.currentTarget as HTMLSelectElement).value as VariableDef['type'];
					const def = type === 'bool' ? false : type === 'int' ? 0 : '';
					updateGlobal(i, { type, default: def });
				}}
			>
				<option value="bool">bool</option>
				<option value="int">int</option>
				<option value="string">string</option>
			</select>
			<input
				value={v.description}
				oninput={(e) =>
					updateGlobal(i, { description: (e.currentTarget as HTMLInputElement).value })}
				placeholder="Description"
			/>
			<button type="button" class="btn btn-danger" onclick={() => removeGlobal(i)}>×</button>
		</div>
	{/each}
</section>

<section>
	<h2>Per-character variables</h2>
	{#if data.perCharacter.length === 0}
		<p class="muted">No per-character groups. Click “Add per-character group” above.</p>
	{/if}
	{#each data.perCharacter as group, gi (gi)}
		<div class="group-card">
			<div class="field">
				<label>Character ID</label>
				<input
					value={group.characterId}
					oninput={(e) =>
						updateGroupCharId(gi, (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
			{#each group.vars as v, vi (v.id + vi)}
				<div class="var-row">
					<input
						value={v.id}
						oninput={(e) =>
							updateGroupVar(gi, vi, { id: (e.currentTarget as HTMLInputElement).value })}
					/>
					<select
						value={v.type}
						onchange={(e) => {
							const type = (e.currentTarget as HTMLSelectElement).value as VariableDef['type'];
							const def = type === 'bool' ? false : type === 'int' ? 0 : '';
							updateGroupVar(gi, vi, { type, default: def });
						}}
					>
						<option value="bool">bool</option>
						<option value="int">int</option>
						<option value="string">string</option>
					</select>
					<button type="button" class="btn btn-danger" onclick={() => removeVarFromGroup(gi, vi)}
						>×</button
					>
				</div>
			{/each}
			<button type="button" class="btn" onclick={() => addVarToGroup(gi)}>Add variable</button>
			<button type="button" class="btn btn-danger" onclick={() => removeGroup(gi)}>Remove group</button>
		</div>
	{/each}
</section>

<style>
	section {
		margin-top: 1.5rem;
	}

	h2 {
		font-size: 1rem;
		margin-bottom: 0.75rem;
	}

	.hint,
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}

	.error-banner {
		padding: 1rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}

	.var-row {
		display: grid;
		grid-template-columns: 1fr 100px 2fr auto;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		align-items: center;
	}

	.group-card {
		padding: 1rem;
		margin-bottom: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.status.error {
		color: var(--error);
	}
</style>
