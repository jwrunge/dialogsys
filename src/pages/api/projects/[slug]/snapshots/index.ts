import type { APIRoute } from 'astro';
import {
	createSnapshot,
	listSnapshots,
	getSnapshotConfig,
	checkGitAvailable,
	GitUnavailableError,
} from '../../../../../lib/server/versioning';
import { jsonResponse, errorResponse } from '../../../../../lib/server/projects';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = params.slug!;
		const git = await checkGitAvailable();
		const snapshots = await listSnapshots(slug);
		const config = getSnapshotConfig();
		return jsonResponse({ snapshots, config, git });
	} catch (e) {
		return errorResponse((e as Error).message, 500);
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	try {
		const slug = params.slug!;
		const git = await checkGitAvailable();
		if (!git.available) {
			return errorResponse(git.message, 503);
		}
		const body = await request.json().catch(() => ({}));
		const reason =
			typeof body.reason === 'string' ? `manual: ${body.reason}` : 'manual: snapshot';
		const snapshot = await createSnapshot(slug, reason);
		if (!snapshot) {
			return jsonResponse({ snapshot: null, created: false, git });
		}
		return jsonResponse({ snapshot, created: true, git });
	} catch (e) {
		if (e instanceof GitUnavailableError) {
			return errorResponse(e.message, 503);
		}
		return errorResponse((e as Error).message, 500);
	}
};
