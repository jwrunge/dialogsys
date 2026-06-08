import { z } from 'zod';
import { charactersFileSchema } from './characters';
import { dialogGraphSchema } from './graph';
import { projectMetaSchema } from './project';
import { storageModeSchema } from './settings';

export const projectsListResponseSchema = z.object({
	projects: z.array(projectMetaSchema),
});

export const projectResponseSchema = z.object({
	project: projectMetaSchema,
});

export const dialogResponseSchema = z.object({
	graph: dialogGraphSchema,
});

export const settingsResponseSchema = z.object({
	projectsRoot: z.string(),
	resolvedPath: z.string(),
	source: z.enum(['env', 'config', 'default']),
	envOverride: z.boolean(),
	storageMode: storageModeSchema,
	syncServerUrl: z.string(),
	hasSyncServerToken: z.boolean(),
	clientId: z.string(),
	configFile: z.string().nullable(),
});

export const charactersResponseSchema = charactersFileSchema;

export const syncTestResponseSchema = z.object({
	ok: z.boolean(),
	projectCount: z.number(),
	error: z.string().optional(),
});

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
