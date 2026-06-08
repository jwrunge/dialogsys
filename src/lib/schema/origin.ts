import { z } from 'zod';

export const originMetaSchema = z.object({
	originId: z.string().uuid(),
	updatedAt: z.string(),
	label: z.string().optional(),
	isSelf: z.boolean().optional(),
	isActive: z.boolean().optional(),
});

export type OriginMeta = z.infer<typeof originMetaSchema>;
