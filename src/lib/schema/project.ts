import { z } from 'zod';

export const projectMetaSchema = z.object({
	slug: z.string(),
	displayName: z.string(),
	description: z.string().default(''),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type ProjectMeta = z.infer<typeof projectMetaSchema>;

export const createProjectInputSchema = z.object({
	slug: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9][a-z0-9_-]*$/),
	displayName: z.string().min(1).max(128),
	description: z.string().max(2000).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
