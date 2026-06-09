import { createHash } from 'node:crypto';
import { type FlowGraph, flowGraphSchema } from '../schema/flow';
import { type DialogGraph, dialogGraphSchema } from '../schema/graph';

function hashCanonicalJson(value: unknown): string {
	const json = `${JSON.stringify(value, null, 2)}\n`;
	return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** SHA-256 of canonical on-disk JSON (matches sync-server file hashing). */
export function hashDialogGraph(graph: DialogGraph): string {
	return hashCanonicalJson(dialogGraphSchema.parse(graph));
}

export function hashFlowGraph(graph: FlowGraph): string {
	return hashCanonicalJson(flowGraphSchema.parse(graph));
}
