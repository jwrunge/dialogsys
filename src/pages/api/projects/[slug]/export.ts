import type { APIRoute } from 'astro';
import { buildExportZip, type ExportFormat } from '../../../../lib/compile/exportProject';
import { toErrorResponse } from '../../../../lib/server/projects';

function parseFormat(value: string | null): ExportFormat {
	return value === 'generic' ? 'generic' : 'godot';
}

export const POST: APIRoute = async ({ params, url }) => {
	try {
		const format = parseFormat(url.searchParams.get('format'));
		const result = await buildExportZip(params.slug!, format);

		return new Response(new Uint8Array(result.buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${result.filename}"`,
				'X-Export-Dialogs': String(result.dialogCount),
				'X-Export-At': result.exportedAt,
				'X-Export-Format': format,
			},
		});
	} catch (e) {
		return toErrorResponse(e);
	}
};
