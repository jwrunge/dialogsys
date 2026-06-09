import type { NotePatchOp } from '../schema/note-patch';

export function computeNotePatch(baseContent: string, nextContent: string): NotePatchOp[] {
	if (baseContent === nextContent) return [];
	return [{ op: 'replaceContent', content: nextContent }];
}

export function applyNotePatchOps(content: string, ops: NotePatchOp[]): string {
	let next = content;
	for (const op of ops) {
		if (op.op === 'replaceContent') {
			next = op.content;
		}
	}
	return next;
}
