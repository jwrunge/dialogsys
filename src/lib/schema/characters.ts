import { z } from 'zod';

export const characterStateSchema = z.object({
	id: z
		.string()
		.min(1)
		.regex(/^[a-z][a-z0-9_]*$/),
	label: z.string().min(1),
	portraitPath: z.string().default(''),
	optOutUnusedWarning: z.boolean().default(false),
});

export const characterSchema = z
	.object({
		id: z
			.string()
			.min(1)
			.regex(/^[a-z][a-z0-9_]*$/),
		displayName: z.string().min(1),
		bio: z.string().default(''),
		portraitPath: z.string().default(''),
		tags: z.array(z.string()).default([]),
		voiceNotes: z.string().default(''),
		defaultStateId: z.string().default('default'),
		states: z.array(characterStateSchema).default([]),
	})
	.transform(migrateCharacter);

export const charactersFileSchema = z.object({
	characters: z.array(characterSchema),
});

export type CharacterState = z.infer<typeof characterStateSchema>;
export type Character = z.infer<typeof characterSchema>;
export type CharactersFile = z.infer<typeof charactersFileSchema>;

function migrateCharacter(raw: z.input<typeof characterSchema>): Character {
	const c = { ...raw };
	if (!c.states || c.states.length === 0) {
		c.states = [
			{
				id: 'default',
				label: 'Default',
				portraitPath: c.portraitPath ?? '',
				optOutUnusedWarning: false,
			},
		];
		c.defaultStateId = 'default';
	}
	if (!c.states.some((s) => s.id === c.defaultStateId)) {
		c.defaultStateId = c.states[0]!.id;
	}
	return c as Character;
}
