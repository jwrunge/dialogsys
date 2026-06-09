import type { GameStateFile, GameStateProperty } from '../schema/gameState';
import { normalizeGameStateFile, normalizeGameStateProperty } from '../schema/gameState';
import type { GameStatePatchOp } from '../schema/game-state-patch';

function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

export function computeGameStatePatch(base: GameStateFile, next: GameStateFile): GameStatePatchOp[] {
	const ops: GameStatePatchOp[] = [];
	const baseNorm = normalizeGameStateFile(base);
	const nextNorm = normalizeGameStateFile(next);

	const baseProps = new Map(baseNorm.properties.map((property) => [property.id, property]));
	const nextProps = new Map(nextNorm.properties.map((property) => [property.id, property]));

	for (const [id, property] of nextProps) {
		const previous = baseProps.get(id);
		if (!previous || stableJson(previous) !== stableJson(property)) {
			ops.push({ op: 'upsertProperty', property });
		}
	}
	for (const id of baseProps.keys()) {
		if (!nextProps.has(id)) {
			ops.push({ op: 'removeProperty', propertyId: id });
		}
	}

	return ops;
}

export function applyGameStatePatchOps(data: GameStateFile, ops: GameStatePatchOp[]): GameStateFile {
	let properties: GameStateProperty[] = [...normalizeGameStateFile(data).properties];

	for (const op of ops) {
		switch (op.op) {
			case 'upsertProperty': {
				const property = normalizeGameStateProperty(op.property);
				const index = properties.findIndex((item) => item.id === property.id);
				if (index >= 0) properties[index] = property;
				else properties = [...properties, property];
				break;
			}
			case 'removeProperty':
				properties = properties.filter((item) => item.id !== op.propertyId);
				break;
		}
	}

	return normalizeGameStateFile({ properties });
}
