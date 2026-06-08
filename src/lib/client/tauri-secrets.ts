export async function isTauriRuntime(): Promise<boolean> {
	try {
		const { invoke } = await import('@tauri-apps/api/core');
		await invoke('has_sync_token');
		return true;
	} catch {
		return false;
	}
}

export async function hasSyncTokenInKeychain(): Promise<boolean> {
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<boolean>('has_sync_token');
}

export async function saveSyncTokenToKeychain(token: string): Promise<void> {
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('set_sync_token', { token: token.trim() });
}

export async function clearSyncTokenFromKeychain(): Promise<void> {
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('clear_sync_token');
}
