export type SyncCredentials = {
	baseUrl: string;
	token?: string;
};

export function normalizeSyncCredentials(input: string | SyncCredentials): SyncCredentials {
	if (typeof input === 'string') {
		return { baseUrl: input.trim().replace(/\/+$/, '') };
	}
	return {
		baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
		token: input.token?.trim() || undefined,
	};
}

export function syncAuthHeaders(token?: string): Record<string, string> {
	const trimmed = token?.trim();
	if (!trimmed) {
		return {};
	}
	return { Authorization: `Bearer ${trimmed}` };
}
