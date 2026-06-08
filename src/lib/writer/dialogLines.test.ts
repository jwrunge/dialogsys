import { describe, expect, it } from 'vitest';
import type { DialogGraph } from '../schema/graph';
import { applyLineUpdates, extractDialogLines, linesToCsv, parseLinesCsv } from './dialogLines';

const sampleGraph: DialogGraph = {
	id: 'tavern_intro',
	displayName: 'Tavern Intro',
	description: '',
	nodes: [
		{ id: 'entry', type: 'entry', position: { x: 0, y: 0 }, data: {} },
		{
			id: 'line1',
			type: 'line',
			position: { x: 0, y: 0 },
			data: { speaker: 'bartender', text: 'Welcome.' },
		},
	],
	edges: [],
	updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('dialogLines', () => {
	it('extracts and round-trips CSV line updates', () => {
		const rows = extractDialogLines(sampleGraph);
		expect(rows).toHaveLength(1);
		const csv = linesToCsv(rows);
		const parsed = parseLinesCsv(csv);
		const updated = applyLineUpdates(sampleGraph, [{ ...parsed[0], text: 'Hello, traveler.' }]);
		const line = updated.nodes.find((n) => n.id === 'line1');
		expect(line?.data.text).toBe('Hello, traveler.');
	});
});
