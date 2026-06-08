import { ApiError } from '../api';

export type ExportDownloadMeta = {
	exportedAt: string;
	dialogCount: number;
	filename: string;
};

export async function downloadExport(
	slug: string,
	format: 'godot' | 'generic' | 'unity' | 'unreal',
): Promise<ExportDownloadMeta> {
	const res = await fetch(`/api/projects/${slug}/export?format=${format}`, {
		method: 'POST',
	});

	if (!res.ok) {
		let message = res.statusText;
		const contentType = res.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			try {
				const data = (await res.json()) as { error?: string };
				message = data.error ?? message;
			} catch {
				// keep status text
			}
		}
		throw new ApiError(message, res.status);
	}

	const blob = await res.blob();
	const exportedAt = res.headers.get('X-Export-At') ?? new Date().toISOString();
	const dialogCount = Number(res.headers.get('X-Export-Dialogs') ?? '0');
	const disposition = res.headers.get('Content-Disposition') ?? '';
	const match = disposition.match(/filename="([^"]+)"/);
	const filename = match?.[1] ?? `${slug}-${format}-export.zip`;

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);

	return { exportedAt, dialogCount, filename };
}

export async function uploadPortrait(
	slug: string,
	characterId: string,
	stateId: string,
	file: File,
): Promise<string> {
	const form = new FormData();
	form.append('file', file);
	form.append('characterId', characterId);
	form.append('stateId', stateId);

	const res = await fetch(`/api/projects/${slug}/portraits`, {
		method: 'POST',
		body: form,
	});

	const contentType = res.headers.get('content-type') ?? '';
	const text = await res.text();

	if (!res.ok) {
		let message = res.statusText;
		if (contentType.includes('application/json') && text) {
			try {
				const data = JSON.parse(text) as { error?: string };
				message = data.error ?? message;
			} catch {
				// keep status text
			}
		}
		throw new ApiError(message, res.status);
	}

	const data = JSON.parse(text) as { path: string };
	return data.path;
}
