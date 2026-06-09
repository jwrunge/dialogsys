import { z } from 'zod';
import { characterSchema } from './characters';

export const charactersPatchOpSchema = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('upsertCharacter'),
		character: characterSchema,
	}),
	z.object({
		op: z.literal('removeCharacter'),
		characterId: z.string().min(1),
	}),
]);

export const charactersPatchRequestSchema = z.object({
	baseContentHash: z.string().min(1),
	ops: z.array(charactersPatchOpSchema).max(500),
});

export type CharactersPatchOp = z.infer<typeof charactersPatchOpSchema>;
export type CharactersPatchRequest = z.infer<typeof charactersPatchRequestSchema>;
