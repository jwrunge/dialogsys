import { describe, expect, it } from 'vitest';
import type { GameStateFile } from '../schema/gameState';
import { hashGameStateFile } from './content-hash';
import { applyGameStatePatchOps, computeGameStatePatch } from './patch';

const base: GameStateFile = {
	properties: [
		{
			id: 'has_key',
			label: 'Has key',
			type: 'boolean',
			useValidValues: true,
		},
	],
};

describe('game state patch', () => {
	it('diffs and applies label updates', () => {
		const next: GameStateFile = {
			properties: base.properties.map((property) =>
				property.id === 'has_key' ? { ...property, label: 'Has tavern key' } : property,
			),
		};
		const ops = computeGameStatePatch(base, next);
		expect(ops).toHaveLength(1);
		expect(ops[0]?.op).toBe('upsertProperty');
		const applied = applyGameStatePatchOps(base, ops);
		expect(applied.properties[0]?.label).toBe('Has tavern key');
	});

	it('content hash changes when game state changes', () => {
		const next = applyGameStatePatchOps(base, [
			{
				op: 'upsertProperty',
				property: { ...base.properties[0]!, label: 'Has tavern key' },
			},
		]);
		expect(hashGameStateFile(next)).not.toBe(hashGameStateFile(base));
	});
});
