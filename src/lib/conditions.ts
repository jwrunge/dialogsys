import type { ConditionAtom, ConditionGroup } from './schema/conditions';

export function conditionAtoms(conditions: ConditionGroup[] | undefined): ConditionAtom[] {
	const first = conditions?.[0];
	if (!first?.all) return [];
	return first.all.filter(
		(c): c is ConditionAtom => 'var' in c && 'op' in c && !('all' in c) && !('any' in c),
	);
}

export function atomsToConditions(atoms: ConditionAtom[]): ConditionGroup[] {
	return atoms.length ? [{ all: atoms }] : [];
}

export function formatConditionAtom(atom: ConditionAtom): string {
	const value = typeof atom.value === 'string' ? `"${atom.value}"` : String(atom.value);
	return `${atom.var} ${atom.op} ${value}`;
}

export function formatConditions(conditions: ConditionGroup[] | undefined): string {
	const atoms = conditionAtoms(conditions);
	if (!atoms.length) return '';
	return atoms.map(formatConditionAtom).join(' AND ');
}
