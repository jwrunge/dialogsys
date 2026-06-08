<script lang="ts">
import { onMount } from 'svelte';
import { apiValidated } from '../lib/api';
import { applyAppLocale, bindLocaleChangeListener } from '../lib/client/transmut';
import { resolveLocaleTag } from '../lib/i18n/locales';
import { settingsResponseSchema } from '../lib/schema/api-responses';

interface Props {
	initialLocale?: string;
}

let { initialLocale = '' }: Props = $props();

onMount(() => {
	let unbind = bindLocaleChangeListener();

	void (async () => {
		let locale = initialLocale.trim();
		if (!locale) {
			try {
				const settings = await apiValidated('/api/settings', settingsResponseSchema);
				locale = settings.locale ?? '';
			} catch {
				locale = '';
			}
		}
		const resolved = resolveLocaleTag(locale, navigator.language);
		await applyAppLocale(resolved);
	})();

	return () => {
		unbind();
	};
});
</script>
