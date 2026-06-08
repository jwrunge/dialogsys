import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSafeRelative, assertSafeSlug, projectDir, projectFilePath } from './paths';

describe('assertSafeSlug', () => {
	it('accepts valid slugs', () => {
		expect(() => assertSafeSlug('demo')).not.toThrow();
		expect(() => assertSafeSlug('my_project-2')).not.toThrow();
	});

	it('rejects invalid slugs', () => {
		expect(() => assertSafeSlug('../evil')).toThrow('Invalid project slug');
		expect(() => assertSafeSlug('')).toThrow('Invalid project slug');
		expect(() => assertSafeSlug('Bad')).toThrow('Invalid project slug');
	});
});

describe('assertSafeRelative', () => {
	it('rejects traversal segments', () => {
		expect(() => assertSafeRelative('../secret')).toThrow('Invalid path');
		expect(() => assertSafeRelative('/etc/passwd')).toThrow('Invalid path');
	});
});

describe('project paths', () => {
	const cwd = '/app/dialogsys';

	beforeEach(() => {
		vi.stubEnv('DIALOGSYS_PROJECTS_ROOT', './projects');
		vi.spyOn(process, 'cwd').mockReturnValue(cwd);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('resolves files inside the project directory', () => {
		const dir = projectDir('demo');
		expect(dir).toBe(`${cwd}/projects/demo`);

		const file = projectFilePath('demo', 'dialogs', 'tavern_intro.graph.json');
		expect(file).toBe(`${cwd}/projects/demo/dialogs/tavern_intro.graph.json`);
	});

	it('blocks path traversal in file segments', () => {
		expect(() => projectFilePath('demo', '..', 'secrets')).toThrow('Invalid path');
	});
});
