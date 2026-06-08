import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExportHook, ValidatorPlugin } from './types';

function resolvePluginPath(modulePath: string): string {
	if (path.isAbsolute(modulePath)) return modulePath;
	return path.resolve(process.cwd(), modulePath);
}

async function importPlugin<T>(modulePath: string): Promise<T | null> {
	try {
		const resolved = resolvePluginPath(modulePath);
		const mod = (await import(pathToFileURL(resolved).href)) as {
			default?: T;
		};
		return mod.default ?? null;
	} catch (e) {
		console.warn(`[plugins] Failed to load ${modulePath}:`, (e as Error).message);
		return null;
	}
}

export async function loadValidatorPlugins(paths: string[]): Promise<ValidatorPlugin[]> {
	const plugins: ValidatorPlugin[] = [];
	for (const p of paths) {
		const plugin = await importPlugin<ValidatorPlugin>(p);
		if (plugin) plugins.push(plugin);
	}
	return plugins;
}

export async function loadExportHooks(paths: string[]): Promise<ExportHook[]> {
	const hooks: ExportHook[] = [];
	for (const p of paths) {
		const hook = await importPlugin<ExportHook>(p);
		if (hook) hooks.push(hook);
	}
	return hooks;
}
