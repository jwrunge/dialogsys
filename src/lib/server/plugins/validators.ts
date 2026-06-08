import type { ValidationIssue } from '../../compile/validate';
import type { Character } from '../../schema/characters';
import type { DialogGraph } from '../../schema/graph';
import { getPluginSettings } from '../settings';
import { loadValidatorPlugins } from './load';

export async function runPluginValidators(
	slug: string,
	graphs: DialogGraph[],
	characters: Character[],
): Promise<ValidationIssue[]> {
	const paths = getPluginSettings().validators ?? [];
	if (paths.length === 0) return [];

	const plugins = await loadValidatorPlugins(paths);
	const issues: ValidationIssue[] = [];
	for (const plugin of plugins) {
		const result = await plugin({ slug, graphs, characters });
		if (Array.isArray(result)) issues.push(...result);
	}
	return issues;
}
