function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge one field using ancestor/local/remote; prefer local on true conflict. */
export function mergeValue<T>(ancestor: T, local: T, remote: T, preferLocalOnConflict = true): T {
	if (stableJson(local) === stableJson(ancestor)) return remote;
	if (stableJson(remote) === stableJson(ancestor)) return local;
	if (stableJson(local) === stableJson(remote)) return local;
	return preferLocalOnConflict ? local : remote;
}

/** Recursively merge plain objects field-by-field. */
export function mergeObjects<A extends Record<string, unknown>>(
	ancestor: A | undefined,
	local: A,
	remote: A,
	preferLocalOnConflict = true,
): A {
	const keys = new Set([
		...Object.keys(ancestor ?? {}),
		...Object.keys(local),
		...Object.keys(remote),
	]);
	const out = { ...local } as A;

	for (const key of keys) {
		const a = ancestor?.[key];
		const l = local[key];
		const r = remote[key];

		if (l === undefined && r !== undefined) {
			(out as Record<string, unknown>)[key] = r;
			continue;
		}
		if (r === undefined && l !== undefined) {
			(out as Record<string, unknown>)[key] = l;
			continue;
		}
		if (l === undefined && r === undefined) {
			delete (out as Record<string, unknown>)[key];
			continue;
		}

		if (isPlainObject(l) && isPlainObject(r)) {
			(out as Record<string, unknown>)[key] = mergeObjects(
				isPlainObject(a) ? (a as Record<string, unknown>) : undefined,
				l,
				r,
				preferLocalOnConflict,
			);
			continue;
		}

		(out as Record<string, unknown>)[key] = mergeValue(a, l, r, preferLocalOnConflict);
	}

	return out;
}

/** Merge entity lists keyed by `id`, preserving local edits on non-overlapping fields. */
export function mergeEntityList<T extends { id: string }>(
	ancestor: T[],
	local: T[],
	remote: T[],
	preferLocalOnConflict = true,
): T[] {
	const aMap = new Map(ancestor.map((entry) => [entry.id, entry]));
	const lMap = new Map(local.map((entry) => [entry.id, entry]));
	const rMap = new Map(remote.map((entry) => [entry.id, entry]));
	const ids = new Set([...aMap.keys(), ...lMap.keys(), ...rMap.keys()]);
	const result: T[] = [];

	for (const id of ids) {
		const a = aMap.get(id);
		const l = lMap.get(id);
		const r = rMap.get(id);

		if (a && !r) {
			if (l && stableJson(l) !== stableJson(a)) result.push(l);
			continue;
		}
		if (a && !l && r) {
			if (stableJson(r) !== stableJson(a)) result.push(r);
			continue;
		}
		if (!l && !r) continue;
		if (!l && r) {
			result.push(r);
			continue;
		}
		if (l && !r) {
			result.push(l);
			continue;
		}

		result.push(
			mergeObjects(
				a as Record<string, unknown> | undefined,
				l as Record<string, unknown>,
				r as Record<string, unknown>,
				preferLocalOnConflict,
			) as T,
		);
	}

	return result;
}

/** Line-oriented text merge for notes when both sides edited since ancestor. */
export function mergeText(ancestor: string, local: string, remote: string): string {
	if (local === ancestor) return remote;
	if (remote === ancestor) return local;
	if (local === remote) return local;

	const aLines = ancestor.split('\n');
	const lLines = local.split('\n');
	const rLines = remote.split('\n');

	if (aLines.length === lLines.length && aLines.length === rLines.length) {
		return aLines
			.map((line, index) => mergeValue(line, lLines[index]!, rLines[index]!))
			.join('\n');
	}

	return local;
}
