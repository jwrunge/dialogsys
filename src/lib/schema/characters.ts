import { z } from 'zod';

export const characterSchema = z.object({
	id: z
		.string()
		.min(1)
		.regex(/^[a-z][a-z0-9_]*$/),
	displayName: z.string().min(1),
	bio: z.string().default(''),
	portraitPath: z.string().default(''),
	tags: z.array(z.string()).default([]),
	voiceNotes: z.string().default(''),
});

export const charactersFileSchema = z.object({
	characters: z.array(characterSchema),
});

export type Character = z.infer<typeof characterSchema>;
export type CharactersFile = z.infer<typeof charactersFileSchema>;
