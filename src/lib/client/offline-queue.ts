const QUEUE_KEY = 'dialogsys-offline-queue';

export type QueuedWrite = {
	id: string;
	url: string;
	method: string;
	body: string;
	createdAt: string;
};

function loadQueue(): QueuedWrite[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(QUEUE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as QueuedWrite[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveQueue(queue: QueuedWrite[]): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineQueue(): QueuedWrite[] {
	return loadQueue();
}

export function getOfflineQueueLength(): number {
	return loadQueue().length;
}

export function enqueueWrite(url: string, init: RequestInit): void {
	const method = (init.method ?? 'GET').toUpperCase();
	if (method === 'GET' || method === 'HEAD') return;
	const body = typeof init.body === 'string' ? init.body : '';
	const queue = loadQueue();
	queue.push({
		id: crypto.randomUUID(),
		url,
		method,
		body,
		createdAt: new Date().toISOString(),
	});
	saveQueue(queue);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('dialogsys:offline-queue-change'));
	}
}

export async function flushOfflineQueue(): Promise<{ flushed: number; failed: number }> {
	const queue = loadQueue();
	if (queue.length === 0) return { flushed: 0, failed: 0 };

	let flushed = 0;
	let failed = 0;
	const remaining: QueuedWrite[] = [];

	for (const item of queue) {
		try {
			const res = await fetch(item.url, {
				method: item.method,
				headers: { 'Content-Type': 'application/json' },
				body: item.body || undefined,
			});
			if (!res.ok) {
				failed += 1;
				remaining.push(item);
				continue;
			}
			flushed += 1;
		} catch {
			failed += 1;
			remaining.push(item);
		}
	}

	saveQueue(remaining);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('dialogsys:offline-queue-change'));
	}
	return { flushed, failed };
}

export function isNetworkError(e: unknown): boolean {
	if (e instanceof TypeError) return true;
	if (e instanceof Error && /failed to fetch|network|load failed/i.test(e.message)) {
		return true;
	}
	return false;
}
