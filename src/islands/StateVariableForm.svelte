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
		try {
			data = await api<VariablesFile>(`/api/projects/${slug}/variables`);
			status = 'idle';
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	async function save() {
		try {
			await api(`/api/projects/${slug}/variables`, {
				method: 'PUT',
				body: JSON.stringify(data),
			});
			status = 'saved';
			message = 'Saved';
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
		data.global = [...data.global, newVar()];
	}

	function addPerCharacter() {
		data.perCharacter = [
			...data.perCharacter,
			{ characterId: '', vars: [newVar()] },
		];
	}

	onMount(load);
</script>

<div class="toolbar">
	<button type="button" class="btn" onclick={addGlobal}>Add global variable</button>
	<button type="button" class="btn" onclick={addPerCharacter}>Add per-character group</button>
	<button type="button" class="btn btn-primary" onclick={save}>Save</button>
	<span class="status" class:saved={status === 'saved'}>{message}</span>
</div>

<section>
	<h2>Global variables</h2>
	{#each data.global as v, i}
		<div class="var-row">
			<input bind:value={v.id} placeholder="id" />
			<select bind:value={v.type}>
				<option value="bool">bool</option>
				<option value="int">int</option>
				<option value="string">string</option>
			</select>
			<input bind:value={v.description} placeholder="Description" />
			<button
				type="button"
				class="btn btn-danger"
				onclick={() => {
					data.global = data.global.filter((_, j) => j !== i);
				}}>×</button
			>
		</div>
	{/each}
</section>

<section>
	<h2>Per-character variables</h2>
	{#each data.perCharacter as group, gi}
		<div class="group-card">
			<div class="field">
				<label>Character ID</label>
				<input bind:value={group.characterId} />
			</div>
			{#each group.vars as v, vi}
				<div class="var-row">
					<input bind:value={v.id} />
					<select bind:value={v.type}>
						<option value="bool">bool</option>
						<option value="int">int</option>
						<option value="string">string</option>
					</select>
					<button
						type="button"
						class="btn btn-danger"
						onclick={() => {
							group.vars = group.vars.filter((_, j) => j !== vi);
							data.perCharacter = [...data.perCharacter];
						}}>×</button
					>
				</div>
			{/each}
			<button
				type="button"
				class="btn"
				onclick={() => {
					group.vars = [...group.vars, newVar()];
					data.perCharacter = [...data.perCharacter];
				}}>Add variable</button
			>
			<button
				type="button"
				class="btn btn-danger"
				onclick={() => {
					data.perCharacter = data.perCharacter.filter((_, j) => j !== gi);
				}}>Remove group</button
			>
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
</style>
