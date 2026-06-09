import type { ConditionAtom, ConditionGroup } from '../schema/conditions';

export type PlaytestState = {
	global: Record<string, boolean | number | string>;
	character: Record<string, Record<string, boolean | number | string>>;
};

function readValue(state: PlaytestState, atom: ConditionAtom): boolean | number | string | undefined {
	const bag =
		atom.scope === 'character' && atom.characterId
			? state.character[atom.characterId]
			: state.global;
	return bag?.[atom.var];
}

function compare(
	actual: boolean | number | string | undefined,
	op: ConditionAtom['op'],
	expected: boolean | number | string,
): boolean {
	if (actual === undefined) return false;
	switch (op) {
		case 'eq':
			return actual === expected;
		case 'neq':
			return actual !== expected;
		case 'gt':
			return Number(actual) > Number(expected);
		case 'gte':
			return Number(actual) >= Number(expected);
		case 'lt':
			return Number(actual) < Number(expected);
		case 'lte':
			return Number(actual) <= Number(expected);
		default:
			return false;
	}
}

function evaluateGroup(state: PlaytestState, group: ConditionGroup): boolean {
	if (group.all) {
		return group.all.every((item) =>
			'all' in item || 'any' in item
				? evaluateGroup(state, item as ConditionGroup)
				: compare(readValue(state, item), item.op, item.value),
		);
	}
	if (group.any) {
		return group.any.some((item) =>
			'all' in item || 'any' in item
				? evaluateGroup(state, item as ConditionGroup)
				: compare(readValue(state, item), item.op, item.value),
		);
	}
	return true;
}

export function evaluateConditions(state: PlaytestState, conditions: ConditionGroup[]): boolean {
	if (!conditions.length) return true;
	return conditions.every((group) => evaluateGroup(state, group));
}

export function defaultPlaytestState(): PlaytestState {
	return { global: {}, character: {} };
}
