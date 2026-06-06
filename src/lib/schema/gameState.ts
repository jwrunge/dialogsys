import { z } from 'zod';

export const gameStatePropertyTypeSchema = z.enum(['boolean', 'number', 'string']);

export const gameStateValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const gameStatePropertySchema = z.object({
	id: z.string(),
	label: z.string(),
	type: gameStatePropertyTypeSchema,
	useValidValues: z.boolean().optional(),
	validValues: z.array(gameStateValueSchema).optional(),
	description: z.string().optional(),
});

export function emptyValueForType(type: GameStatePropertyType): GameStateValue {
	if (type === 'boolean') return false;
	if (type === 'number') return 0;
	return '';
}

export function initialValueForProperty(prop: GameStateProperty): GameStateValue {
	if (prop.validValues?.length) return prop.validValues[0]!;
	return emptyValueForType(prop.type);
}

export function defaultUseValidValues(type: GameStatePropertyType): boolean {
	return type === 'string';
}

export function normalizeGameStateProperty(
	prop: GameStateProperty & { defaultValue?: GameStateValue },
): GameStateProperty {
	const { defaultValue: _legacyDefault, ...base } = prop;

	if (base.type === 'boolean') {
		const { validValues: _, ...rest } = base;
		return { ...rest, useValidValues: true };
	}

	const useValidValues = base.useValidValues ?? defaultUseValidValues(base.type);
	if (!useValidValues) {
		const { validValues: _, ...rest } = base;
		return { ...rest, useValidValues: false };
	}

	return {
		...base,
		useValidValues: true,
		validValues: base.validValues ?? [],
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
