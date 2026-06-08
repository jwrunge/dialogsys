import { z } from 'zod';
import { conditionsSchema } from './conditions';

export const nodeTypeSchema = z.enum([
	'entry',
	'blank',
	'line',
	'choice',
	'condition',
	'set_var',
	'jump',
	'direction',
	'end',
]);

export const choiceOptionSchema = z.object({
	id: z.string(),
	text: z.string(),
	conditions: conditionsSchema,
});

export const setVarOpSchema = z.object({
	scope: z.enum(['global', 'character']),
	characterId: z.string().optional(),
	var: z.string(),
	value: z.union([z.boolean(), z.number(), z.string()]),
});

export const graphNodeDataSchema = z.object({
	label: z.string().optional(),
	speaker: z.string().optional(),
	text: z.string().optional(),
	portraitPath: z.string().optional(),
	characterState: z.string().optional(),
	emotion: z.string().optional(),
	forceBranch: z.enum(['true', 'false']).optional(),
	options: z.array(choiceOptionSchema).optional(),
	branchVar: z.string().optional(),
	branchScope: z.enum(['global', 'character']).optional(),
	branchCharacterId: z.string().optional(),
	trueLabel: z.string().optional(),
	falseLabel: z.string().optional(),
	setOps: z.array(setVarOpSchema).optional(),
	targetDialogId: z.string().optional(),
	targetEntryNodeId: z.string().optional(),
	directionText: z.string().optional(),
	sceneRef: z.string().optional(),
});

export const graphNodeSchema = z.object({
	id: z.string().min(1).max(128),
	type: nodeTypeSchema,
	position: z.object({ x: z.number(), y: z.number() }),
	data: graphNodeDataSchema.default({}),
});

export const graphEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	sourceHandle: z.string().nullable().optional(),
	targetHandle: z.string().nullable().optional(),
	data: z
		.object({
			conditions: conditionsSchema.optional(),
			branch: z.enum(['true', 'false', 'default']).optional(),
			forceUse: z.boolean().optional(),
			ignoreUnusedWarning: z.boolean().optional(),
		})
		.optional(),
});

export const dialogGraphSchema = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z][a-z0-9_]*$/),
	displayName: z.string().min(1).max(128),
	description: z.string().max(2000).default(''),
	nodes: z.array(graphNodeSchema).max(5000),
	edges: z.array(graphEdgeSchema).max(10000),
	updatedAt: z.string().optional(),
});

export type DialogGraph = z.infer<typeof dialogGraphSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphNodeData = z.infer<typeof graphNodeDataSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
