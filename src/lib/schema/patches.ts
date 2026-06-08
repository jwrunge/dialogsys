import type { z } from 'zod';
import { dialogGraphSchema } from './graph';
import { projectMetaSchema } from './project';

export const updateProjectPatchSchema = projectMetaSchema
	.pick({ displayName: true, description: true })
	.partial()
	.strict();

export const updateDialogMetaPatchSchema = dialogGraphSchema
	.pick({ displayName: true, description: true })
	.partial()
	.strict();

export type UpdateProjectPatch = z.infer<typeof updateProjectPatchSchema>;
export type UpdateDialogMetaPatch = z.infer<typeof updateDialogMetaPatchSchema>;
