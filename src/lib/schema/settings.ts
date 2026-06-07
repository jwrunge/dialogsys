import { z } from 'zod';

export const appSettingsSchema = z.object({
	projectsRoot: z.string().min(1).optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
