<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../lib/api';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	onMount(async () => {
		let intervalMs = 300_000;
		let gitAvailable = false;

		try {
			const res = await api<{
				config: { intervalMs: number };
				git: { available: boolean };
			}>(`/api/projects/${slug}/snapshots`);
			intervalMs = res.config.intervalMs;
			gitAvailable = res.git.available;
		} catch {
			return;
		}

		if (!gitAvailable) return;

		const tick = () => {
			api(`/api/projects/${slug}/snapshots/heartbeat`, { method: 'POST' }).catch(() => {});
		};

		const id = setInterval(tick, intervalMs);
		return () => clearInterval(id);
	});
</script>
