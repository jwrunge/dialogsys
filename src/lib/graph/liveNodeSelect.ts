const GLOBAL_KEY = '__dialogsys_live_graph_select__';

type GraphNodeSelectHandler = (nodeId: string) => void;

/** Register the active editor's select handler (avoids stale xyflow callback closures). */
export function bindLiveGraphNodeSelect(handler: GraphNodeSelectHandler): () => void {
	(globalThis as Record<string, unknown>)[GLOBAL_KEY] = handler;
	return () => {
		if ((globalThis as Record<string, unknown>)[GLOBAL_KEY] === handler) {
			delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
		}
	};
}

export function liveGraphNodeSelect(nodeId: string): void {
	const handler = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
		| GraphNodeSelectHandler
		| undefined;
	handler?.(nodeId);
}
