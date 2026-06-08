import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateConfiguredProjectsRoot } from './projectsRoot';

describe('validateConfiguredProjectsRoot', () => {
	const cwd = '/app/dialogsys';

	beforeEach(() => {
		vi.spyOn(process, 'cwd').mockReturnValue(cwd);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('accepts relative paths under cwd', () => {
		expect(validateConfiguredProjectsRoot('./projects')).toBe('./projects');
		expect(validateConfiguredProjectsRoot('projects')).toBe('projects');
	});

	it('rejects upward traversal', () => {
		expect(() => validateConfiguredProjectsRoot('../outside')).toThrow(
			'Projects path cannot escape upward',
		);
	});

	it('rejects absolute paths in settings UI mode', () => {
		expect(() => validateConfiguredProjectsRoot('/tmp/projects')).toThrow(
			'Projects path must be relative to the app directory',
		);
	});

	it('allows absolute paths when explicitly permitted', () => {
		expect(validateConfiguredProjectsRoot('/var/dialogsys/projects', { allowAbsolute: true })).toBe(
			'/var/dialogsys/projects',
		);
	});
});
