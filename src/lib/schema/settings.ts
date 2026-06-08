import { z } from 'zod';

export const storageModeSchema = z.enum(['local', 'remote']);

export const localeSchema = z
	.string()
	.regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/)
	.optional();

export const appSettingsSchema = z.object({
	projectsRoot: z.string().min(1).optional(),
	storageMode: storageModeSchema.optional(),
	syncServerUrl: z.string().optional(),
	syncServerToken: z.string().optional(),
	clientId: z.string().uuid().optional(),
	locale: localeSchema,
	activeOrigins: z.record(z.string(), z.string().uuid()).optional(),
	originLabels: z.record(z.string(), z.string()).optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type StorageMode = z.infer<typeof storageModeSchema>;
