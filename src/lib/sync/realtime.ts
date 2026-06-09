import { normalizeSyncCredentials, type SyncCredentials } from './credentials';

export type CoauthorRole = 'read' | 'write';

export type CoauthorPeer = {
	deviceId: string;
	displayName: string;
	originId?: string;
	focusPath?: string;
	role: CoauthorRole;
};

export type CoauthorFileUpdate = {
	originId: string;
	path: string;
	contentHash: string;
};

export const COAUTHOR_PRESENCE_EVENT = 'dialogsys:coauthor-presence';
export const COAUTHOR_FILE_UPDATED_EVENT = 'dialogsys:coauthor-file-updated';

type ServerMessage =
	| { type: 'presence'; peers: CoauthorPeer[] }
	| { type: 'fileUpdated'; originId: string; path: string; contentHash: string };

export function syncHttpToWsUrl(httpUrl: string): string {
	const url = new URL(httpUrl);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.toString().replace(/\/+$/, '');
}

export function syncEventsUrl(httpUrl: string, slug: string, token?: string): string {
	const base = httpUrl.replace(/\/+$/, '');
	const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
	return `${base}/projects/${encodeURIComponent(slug)}/realtime/events${tokenQuery}`;
}

export type CoauthorSessionOptions = {
	slug: string;
	credentials: string | SyncCredentials;
	deviceId: string;
	displayName: string;
	originId: string;
};

export type CoauthorSession = {
	setFocus: (path: string | null) => void;
	close: () => void;
};

const RECONNECT_MS = 5_000;

async function postPresence(
	baseUrl: string,
	slug: string,
	token: string | undefined,
	body: Record<string, unknown>,
	path: 'presence' | 'leave',
): Promise<void> {
	const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	await fetch(`${baseUrl}/projects/${encodeURIComponent(slug)}/realtime/${path}${tokenQuery}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

function parseEventData(raw: string): ServerMessage | null {
	try {
		return JSON.parse(raw) as ServerMessage;
	} catch {
		return null;
	}
}

export function connectCoauthorSession(options: CoauthorSessionOptions): CoauthorSession {
	const { slug, deviceId, displayName, originId } = options;
	const { baseUrl, token } = normalizeSyncCredentials(options.credentials);

	let closed = false;
	let focusPath: string | null = null;
	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function dispatchPresence(peers: CoauthorPeer[]) {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(
			new CustomEvent(COAUTHOR_PRESENCE_EVENT, {
				detail: { peers },
			}),
		);
	}

	function dispatchFileUpdated(update: CoauthorFileUpdate) {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(
			new CustomEvent(COAUTHOR_FILE_UPDATED_EVENT, {
				detail: update,
			}),
		);
	}

	async function publishPresence() {
		await postPresence(baseUrl, slug, token, {
			deviceId,
			displayName,
			originId,
			focusPath,
		}, 'presence');
	}

	function connectEvents() {
		if (closed || typeof EventSource === 'undefined') return;
		const url = syncEventsUrl(baseUrl, slug, token);
		eventSource = new EventSource(url);

		eventSource.onmessage = (event) => {
			const data = parseEventData(event.data);
			if (!data) return;
			if (data.type === 'presence') {
				dispatchPresence(data.peers ?? []);
			} else if (data.type === 'fileUpdated') {
				dispatchFileUpdated({
					originId: data.originId,
					path: data.path,
					contentHash: data.contentHash,
				});
			}
		};

		eventSource.onerror = () => {
			eventSource?.close();
			eventSource = null;
			if (!closed) {
				reconnectTimer = setTimeout(() => {
					void publishPresence().finally(connectEvents);
				}, RECONNECT_MS);
			}
		};
	}

	void publishPresence().then(connectEvents);

	return {
		setFocus(path: string | null) {
			focusPath = path;
			void publishPresence();
		},
		close() {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			eventSource?.close();
			eventSource = null;
			void postPresence(baseUrl, slug, token, { deviceId }, 'leave');
		},
	};
}
