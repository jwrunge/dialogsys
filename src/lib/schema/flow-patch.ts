import { z } from 'zod';
import { flowEdgeSchema, flowNodeSchema } from './flow';

export const flowPatchOpSchema = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('upsertNode'),
		node: flowNodeSchema,
	}),
	z.object({
		op: z.literal('removeNode'),
		nodeId: z.string().min(1),
	}),
	z.object({
		op: z.literal('upsertEdge'),
		edge: flowEdgeSchema,
	}),
	z.object({
		op: z.literal('removeEdge'),
		edgeId: z.string().min(1),
	}),
	z.object({
		op: z.literal('updateMeta'),
		displayName: z.string().min(1).max(128).optional(),
	}),
]);

export const flowPatchRequestSchema = z.object({
	baseContentHash: z.string().min(1),
	ops: z.array(flowPatchOpSchema).max(500),
});

export type FlowPatchOp = z.infer<typeof flowPatchOpSchema>;
export type FlowPatchRequest = z.infer<typeof flowPatchRequestSchema>;
