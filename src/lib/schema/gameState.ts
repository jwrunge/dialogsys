import { z } from 'zod';

export const gameStatePropertyTypeSchema = z.enum(['boolean', 'number', 'string']);

export const gameStateValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const gameStatePropertySchema = z.object({
	id: z.string(),
	label: z.string(),
	type: gameStatePropertyTypeSchema,
	defaultValue: gameStateValueSchema,
	useValidValues: z.boolean().optional(),
	validValues: z.array(gameStateValueSchema).optional(),
	description: z.string().optional(),
});

export function defaultUseValidValues(type: GameStatePropertyType): boolean {
	return type === 'string';
}

export function normalizeGameStateProperty(prop: GameStateProperty): GameStateProperty {
	if (prop.type === 'boolean') {
		const { validValues: _, ...rest } = prop;
		return { ...rest, useValidValues: true };
	}

	const useValidValues = prop.useValidValues ?? defaultUseValidValues(prop.type);
	if (!useValidValues) {
		const { validValues: _, ...rest } = prop;
		return { ...rest, useValidValues: false };
	}

	return {
		...prop,
		useValidValues: true,
		validValues: prop.validValues ?? [],
	};
}

export function normalizeGameStateFile(file: GameStateFile): GameStateFile {
	return {
		properties: file.properties.map(normalizeGameStateProperty),
	};
}

export const gameStateFileSchema = z.object({
	properties: z.array(gameStatePropertySchema).default([]),
});

export type GameStatePropertyType = z.infer<typeof gameStatePropertyTypeSchema>;
export type GameStateValue = z.infer<typeof gameStateValueSchema>;
export type GameStateProperty = z.infer<typeof gameStatePropertySchema>;
export type GameStateFile = z.infer<typeof gameStateFileSchema>;
