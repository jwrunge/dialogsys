import fs from 'node:fs/promises';
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isBinaryProjectPath } from '../../../../../lib/portraits';
import {
	assertWritable,
	resolveSyncAccessRole,
} from '../../../../../lib/server/collaboration/access';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../../../../../lib/server/http';
import { projectFilePath } from '../../../../../lib/server/paths';
import { getAppSettingsInfo } from '../../../../../lib/server/settings';
import { pullOriginFile, pushFileToOrigin } from '../../../../../lib/server/sync-remote';

const resolveSchema = z.object({
	path: z.string().min(1),
	action: z.enum(['reload', 'force']),
});

export const POST: APIRoute = async ({ params, request }) => {
	try {
		assertWritable(await resolveSyncAccessRole());
		const slug = params.slug!;
		const info = getAppSettingsInfo();
		if (info.storageMode !== 'remote' || !info.syncServerUrl) {
			return toErrorResponse(new Error('Conflict resolution requires remote storage'));
		}

		const body = resolveSchema.parse(await parseJsonBody(request));
		const relPath = body.path.replace(/^\/+/, '');

		if (body.action === 'reload') {
			await pullOriginFile(slug, relPath);
			const file = projectFilePath(slug, ...relPath.split('/'));
			const content = isBinaryProjectPath(relPath)
				? (await fs.readFile(file)).toString('base64')
				: await fs.readFile(file, 'utf-8');
			return jsonResponse({ ok: true, action: 'reload', path: relPath, content });
		}

		const file = projectFilePath(slug, ...relPath.split('/'));
		const content = isBinaryProjectPath(relPath)
			? (await fs.readFile(file)).toString('base64')
			: await fs.readFile(file, 'utf-8');
		await pushFileToOrigin(slug, relPath, content, { force: true });
		return jsonResponse({ ok: true, action: 'force', path: relPath });
	} catch (e) {
		return toErrorResponse(e);
	}
};
