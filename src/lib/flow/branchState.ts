import { nanoid } from 'nanoid';
import type { ConditionOp } from '../schema/conditions';
import type { FlowBranchOption } from '../schema/flow';
import {
	defaultUseValidValues,
	initialValueForProperty,
	type GameStateProperty,
	type GameStatePropertyType,
} from '../schema/gameState';

export function defaultValidValues(type: GameStatePropertyType): Array<boolean | number | string> {
	if (type === 'boolean') return [false, true];
	return [];
}

export function usesEnumValues(prop: GameStateProperty): boolean {
	if (prop.type === 'boolean') return true;
	const useValidValues = prop.useValidValues ?? defaultUseValidValues(prop.type);
	if (!useValidValues) return false;
	const values = prop.validValues ?? defaultValidValues(prop.type);
	return values.length > 0;
}

export function resolvedValidValues(
	prop: GameStateProperty,
): Array<boolean | number | string> {
	if (prop.type === 'boolean') return [false, true];
	const useValidValues = prop.useValidValues ?? defaultUseValidValues(prop.type);
	if (!useValidValues) return [];
	return prop.validValues?.length ? prop.validValues : defaultValidValues(prop.type);
}

function formatValueLabel(value: boolean | number | string): string {
	return typeof value === 'string' ? value : String(value);
}

function matchValueKey(value: boolean | number | string): string {
	return JSON.stringify(value);
}

export function syncEnumBranchOptions(
	prop: GameStateProperty,
	existing: FlowBranchOption[] = [],
): FlowBranchOption[] {
	const values = resolvedValidValues(prop);
	const byValue = new Map(
		existing
			.filter((o) => o.matchValue !== undefined)
			.map((o) => [matchValueKey(o.matchValue!), o]),
	);

	return values.map((value) => {
		const prev = byValue.get(matchValueKey(value));
		return {
			id: prev?.id ?? nanoid(6),
			label: prev?.label ?? formatValueLabel(value),
			matchValue: value,
		};
	});
}

const OP_SYMBOLS: Record<ConditionOp, string> = {
	eq: '=',
	neq: '≠',
	gt: '>',
	gte: '≥',
	lt: '<',
	lte: '≤',
};

export function formatBranchPathSummary(
	option: FlowBranchOption,
	state?: GameStateProperty | null,
): string {
	if (option.isDefault) return `${option.label} (default)`;
	if (option.matchValue !== undefined) {
		const prefix = state ? `${state.label} ` : '';
		return `${prefix}= ${formatValueLabel(option.matchValue)}`;
	}
	if (option.compareOp !== undefined && option.compareValue !== undefined) {
		const prefix = state ? `${state.label} ` : '';
		const op = OP_SYMBOLS[option.compareOp] ?? option.compareOp;
		return `${prefix}${op} ${formatValueLabel(option.compareValue)}`;
	}
	return option.label;
}

export function createCompareBranch(
	prop: GameStateProperty,
	partial?: Partial<FlowBranchOption>,
): FlowBranchOption {
	return {
		id: partial?.id ?? nanoid(6),
		label: partial?.label ?? 'New branch',
		compareOp: (partial?.compareOp ?? 'eq') as ConditionOp,
		compareValue: partial?.compareValue ?? initialValueForProperty(prop),
		isDefault: partial?.isDefault,
	};
}
