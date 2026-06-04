import { z } from 'zod';

export const variableDefSchema = z.object({
	id: z
		.string()
		.min(1)
		.regex(/^[a-z][a-z0-9_]*$/),
	type: z.enum(['bool', 'int', 'string']),
	default: z.union([z.boolean(), z.number(), z.string()]),
	description: z.string().default(''),
});

export const perCharacterVarsSchema = z.object({
	characterId: z.string(),
	vars: z.array(variableDefSchema),
});

export const variablesFileSchema = z.object({
	global: z.array(variableDefSchema).default([]),
	perCharacter: z.array(perCharacterVarsSchema).default([]),
});

export type VariableDef = z.infer<typeof variableDefSchema>;
export type VariablesFile = z.infer<typeof variablesFileSchema>;
