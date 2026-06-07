import { z } from 'zod';
import { conditionOpSchema } from './conditions';
import { gameStateValueSchema } from './gameState';

export const flowNodeTypeSchema = z.enum(['start', 'scene', 'branch', 'end']);

export const flowFirstMeetingSchema = z.object({
	characterId: z.string(),
	displayName: z.string(),
});

export const flowBranchOptionSchema = z.object({
	id: z.string(),
	label: z.string(),
	matchValue: gameStateValueSchema.optional(),
	compareOp: conditionOpSchema.optional(),
	compareValue: gameStateValueSchema.optional(),
	isDefault: z.boolean().optional(),
});

export const flowNodeDataSchema = z.object({
	label: z.string().optional(),
	dialogId: z.string().optional(),
	branchStateId: z.string().optional(),
	notes: z.string().optional(),
	firstMeetings: z.array(flowFirstMeetingSchema).optional(),
	options: z.array(flowBranchOptionSchema).optional(),
});

export const flowNodeSchema = z.object({
	id: z.string(),
	type: flowNodeTypeSchema,
	position: z.object({ x: z.number(), y: z.number() }),
	data: flowNodeDataSchema.default({}),
});

export const flowEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	sourceHandle: z.string().nullable().optional(),
	targetHandle: z.string().nullable().optional(),
	data: z
		.object({
			label: z.string().optional(),
		})
		.optional(),
});

export const flowGraphSchema = z.object({
	id: z.string().default('main'),
	displayName: z.string().default('Main sequence'),
	nodes: z.array(flowNodeSchema),
	edges: z.array(flowEdgeSchema),
	updatedAt: z.string().optional(),
});

export type FlowGraph = z.infer<typeof flowGraphSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type FlowNodeData = z.infer<typeof flowNodeDataSchema>;
export type FlowBranchOption = z.infer<typeof flowBranchOptionSchema>;
export type FlowFirstMeeting = z.infer<typeof flowFirstMeetingSchema>;
