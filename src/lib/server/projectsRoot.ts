import path from 'node:path';

export type ProjectsRootValidationOptions = {
	/** Allow absolute paths (e.g. DIALOGSYS_PROJECTS_ROOT from Tauri). */
	allowAbsolute?: boolean;
};

/**
 * Validates a user-configured projects root (settings UI).
 * Relative paths must resolve under process.cwd().
 */
export function validateConfiguredProjectsRoot(
	projectsRoot: string,
	options: ProjectsRootValidationOptions = {},
): string {
	const trimmed = projectsRoot.trim();
	if (!trimmed || trimmed.includes('\0')) {
		throw new Error('Invalid projects path');
	}

	const normalized = path.normalize(trimmed);
	if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
		throw new Error('Projects path cannot escape upward');
	}

	if (path.isAbsolute(normalized)) {
		if (!options.allowAbsolute) {
			throw new Error('Projects path must be relative to the app directory');
		}
		return normalized;
	}

	const resolved = path.resolve(process.cwd(), normalized);
	const cwd = path.resolve(process.cwd());
	if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
		throw new Error('Projects path must stay within the app directory');
	}

	return trimmed;
}
