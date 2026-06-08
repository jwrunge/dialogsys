export class SyncUrlPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SyncUrlPolicyError';
	}
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
	const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!match) return null;
	const parts = match.slice(1).map((p) => Number(p));
	if (parts.some((p) => p > 255)) return null;
	return parts as [number, number, number, number];
}

function isBlockedHostname(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	if (lower === 'localhost' || lower.endsWith('.localhost')) {
		return false;
	}
	if (lower === 'metadata.google.internal' || lower.endsWith('.internal')) {
		return true;
	}
	return false;
}

function isBlockedIp(hostname: string): boolean {
	const ipv4 = parseIpv4(hostname);
	if (ipv4) {
		const [a, b] = ipv4;
		if (a === 10) return true;
		if (a === 127) return false;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 0) return true;
		return false;
	}

	const lower = hostname.toLowerCase();
	if (lower === '::1') return false;
	if (lower.startsWith('fe80:')) return true;
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
	return false;
}

/** Validates sync server URLs; blocks private/link-local/metadata targets. */
export function assertAllowedSyncServerUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url.trim().replace(/\/+$/, ''));
	} catch {
		throw new SyncUrlPolicyError('Invalid sync server URL');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new SyncUrlPolicyError('Sync server URL must use http or https');
	}

	if (parsed.username || parsed.password) {
		throw new SyncUrlPolicyError('Sync server URL must not include credentials');
	}

	const hostname = parsed.hostname;
	if (isBlockedHostname(hostname) || isBlockedIp(hostname)) {
		throw new SyncUrlPolicyError('Sync server URL points to a blocked host');
	}

	return parsed;
}
