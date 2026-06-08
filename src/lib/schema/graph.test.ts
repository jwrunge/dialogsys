import { describe, expect, it } from 'vitest';
import { dialogGraphSchema, nodeTypeSchema } from './graph';

describe('nodeTypeSchema', () => {
	it('accepts known node types', () => {
		expect(nodeTypeSchema.parse('line')).toBe('line');
		expect(nodeTypeSchema.parse('choice')).toBe('choice');
	});

	it('rejects unknown node types', () => {
		expect(() => nodeTypeSchema.parse('unknown')).toThrow();
	});
});

describe('dialogGraphSchema', () => {
	it('parses a minimal valid graph', () => {
		const parsed = dialogGraphSchema.parse({
			id: 'tavern_intro',
			displayName: 'Tavern Intro',
			nodes: [{ id: 'entry', type: 'entry', position: { x: 0, y: 0 } }],
			edges: [],
		});
		expect(parsed.id).toBe('tavern_intro');
	});

	it('rejects invalid scene ids', () => {
		expect(() =>
			dialogGraphSchema.parse({
				id: 'Bad-ID',
				displayName: 'X',
				nodes: [],
				edges: [],
			}),
		).toThrow();
	});
});
