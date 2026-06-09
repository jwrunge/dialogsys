import { z } from 'zod';
import { gameStatePropertySchema } from './gameState';

export const gameStatePatchOpSchema = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('upsertProperty'),
		property: gameStatePropertySchema,
	}),
	z.object({
		op: z.literal('removeProperty'),
		propertyId: z.string().min(1),
	}),
]);

export const gameStatePatchRequestSchema = z.object({
	baseContentHash: z.string().min(1),
	ops: z.array(gameStatePatchOpSchema).max(500),
});

export type GameStatePatchOp = z.infer<typeof gameStatePatchOpSchema>;
export type GameStatePatchRequest = z.infer<typeof gameStatePatchRequestSchema>;
