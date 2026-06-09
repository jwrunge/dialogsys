/** Path of the project file currently being edited (for realtime presence). */
let focusPath: string | null = null;
let sessionFocus: ((path: string | null) => void) | null = null;

export function registerCoauthorFocusHandler(handler: (path: string | null) => void): void {
	sessionFocus = handler;
	if (focusPath !== null) {
		handler(focusPath);
	}
}

export function unregisterCoauthorFocusHandler(handler: (path: string | null) => void): void {
	if (sessionFocus === handler) {
		sessionFocus = null;
	}
}

export function setCoauthorFocusPath(path: string | null): void {
	focusPath = path;
	sessionFocus?.(path);
}

export function getCoauthorFocusPath(): string | null {
	return focusPath;
}

export function sceneGraphPath(sceneId: string): string {
	return `dialogs/${sceneId}.graph.json`;
}

export function sequenceGraphPath(sequenceId: string): string {
	return `sequences/${sequenceId}.graph.json`;
}
