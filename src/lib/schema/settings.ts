import { z } from 'zod';

export const storageModeSchema = z.enum(['local', 'remote']);

export const appSettingsSchema = z.object({
	projectsRoot: z.string().min(1).optional(),
	storageMode: storageModeSchema.optional(),
	syncServerUrl: z.string().optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type StorageMode = z.infer<typeof storageModeSchema>;
