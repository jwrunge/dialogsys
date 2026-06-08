import { z } from 'zod';

export const conditionOpSchema = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

export const conditionAtomSchema = z.object({
	scope: z.enum(['global', 'character']),
	characterId: z.string().optional(),
	var: z.string(),
	op: conditionOpSchema,
	value: z.union([z.string(), z.number(), z.boolean()]),
});

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
	z.union([
		z.object({ all: z.array(z.union([conditionAtomSchema, conditionGroupSchema])) }),
		z.object({ any: z.array(z.union([conditionAtomSchema, conditionGroupSchema])) }),
	]),
);

export type ConditionAtom = z.infer<typeof conditionAtomSchema>;
export type ConditionGroup = {
	all?: (ConditionAtom | ConditionGroup)[];
	any?: (ConditionAtom | ConditionGroup)[];
};

export const conditionsSchema = z.array(conditionGroupSchema).default([]);
