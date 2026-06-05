import { z } from 'zod';

export const gameStatePropertyTypeSchema = z.enum(['boolean', 'number', 'string']);

export const gameStatePropertySchema = z.object({
	id: z.string(),
	label: z.string(),
	type: gameStatePropertyTypeSchema,
	defaultValue: z.union([z.boolean(), z.number(), z.string()]),
	description: z.string().optional(),
});

export const gameStateFileSchema = z.object({
	properties: z.array(gameStatePropertySchema).default([]),
});

export type GameStatePropertyType = z.infer<typeof gameStatePropertyTypeSchema>;
export type GameStateProperty = z.infer<typeof gameStatePropertySchema>;
export type GameStateFile = z.infer<typeof gameStateFileSchema>;
