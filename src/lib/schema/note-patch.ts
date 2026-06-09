import { z } from 'zod';

export const notePatchOpSchema = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('replaceContent'),
		content: z.string(),
	}),
]);

export const notePatchRequestSchema = z.object({
	baseContentHash: z.string().min(1),
	ops: z.array(notePatchOpSchema).max(50),
});

export type NotePatchOp = z.infer<typeof notePatchOpSchema>;
export type NotePatchRequest = z.infer<typeof notePatchRequestSchema>;
