import { ApiError } from '../api';

export type PatchSaveResult<TSaved> = {
	saved: TSaved;
	contentHash: string;
	rebased?: boolean;
};

export async function savePatchWithRebase<TSaved, TOps, TResponse>(options: {
	url: string;
	path: string;
	saved: TSaved;
	next: TSaved;
	contentHash: string;
	ops: TOps[];
	computeOps: (base: TSaved, desired: TSaved) => TOps[];
	parseSuccess: (response: TResponse) => { saved: TSaved; contentHash: string };
	parseConflict: (body: Record<string, unknown>) => { saved: TSaved; contentHash: string } | null;
}): Promise<PatchSaveResult<TSaved>> {
	const requestBody = { baseContentHash: options.contentHash, ops: options.ops };
	const first = await patchRequest<TResponse>(options.url, requestBody);

	if (first.ok) {
		const parsed = options.parseSuccess(first.data);
		return { saved: parsed.saved, contentHash: parsed.contentHash };
	}

	if (first.status !== 409) {
		throw new ApiError(first.message, first.status, first.path ? { path: first.path } : undefined);
	}

	const parsed = options.parseConflict(first.data);
	if (!parsed) {
		throw new ApiError(first.message, 409, { path: options.path });
	}

	const retryOps = options.computeOps(parsed.saved, options.next);
	if (retryOps.length === 0) {
		return { saved: parsed.saved, contentHash: parsed.contentHash, rebased: true };
	}

	const second = await patchRequest<TResponse>(options.url, {
		baseContentHash: parsed.contentHash,
		ops: retryOps,
	});

	if (!second.ok) {
		throw new ApiError(second.message, second.status, second.path ? { path: second.path } : undefined);
	}

	const retryParsed = options.parseSuccess(second.data);
	return {
		saved: retryParsed.saved,
		contentHash: retryParsed.contentHash,
		rebased: true,
	};
}

async function patchRequest<T>(
	url: string,
	body: { baseContentHash: string; ops: unknown[] },
): Promise<
	| { ok: true; data: T }
	| { ok: false; status: number; message: string; data: Record<string, unknown>; path?: string }
> {
	const res = await fetch(url, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let data: Record<string, unknown> = {};
	if (text.trim()) {
		try {
			data = JSON.parse(text) as Record<string, unknown>;
		} catch {
			data = {};
		}
	}

	if (res.ok) {
		return { ok: true, data: data as T };
	}

	const message = typeof data.error === 'string' ? data.error : res.statusText;
	const path = typeof data.path === 'string' ? data.path : undefined;
	return { ok: false, status: res.status, message, data, path };
}
