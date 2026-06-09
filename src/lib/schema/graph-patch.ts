import { z } from 'zod';
import { graphEdgeSchema, graphNodeSchema } from './graph';

export const graphPatchOpSchema = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('upsertNode'),
		node: graphNodeSchema,
	}),
	z.object({
		op: z.literal('removeNode'),
		nodeId: z.string().min(1),
	}),
	z.object({
		op: z.literal('upsertEdge'),
		edge: graphEdgeSchema,
	}),
	z.object({
		op: z.literal('removeEdge'),
		edgeId: z.string().min(1),
	}),
	z.object({
		op: z.literal('updateMeta'),
		displayName: z.string().min(1).max(128).optional(),
		description: z.string().max(2000).optional(),
	}),
]);

export const graphPatchRequestSchema = z.object({
	baseContentHash: z.string().min(1),
	ops: z.array(graphPatchOpSchema).max(500),
});

export type GraphPatchOp = z.infer<typeof graphPatchOpSchema>;
export type GraphPatchRequest = z.infer<typeof graphPatchRequestSchema>;
