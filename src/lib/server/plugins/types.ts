import type { ValidationIssue } from '../../compile/validate';
import type { Character } from '../../schema/characters';
import type { DialogGraph } from '../../schema/graph';

export type ValidatorPluginContext = {
	slug: string;
	graphs: DialogGraph[];
	characters: Character[];
};

export type ValidatorPlugin = (
	ctx: ValidatorPluginContext,
) => ValidationIssue[] | Promise<ValidationIssue[]>;

export type ExportHookContext = {
	slug: string;
	format: string;
	entries: { name: string; content: string | Buffer }[];
};

export type ExportHook = (ctx: ExportHookContext) => ExportHookContext | Promise<ExportHookContext>;
