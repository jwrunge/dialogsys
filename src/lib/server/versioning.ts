import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { projectDir } from './projects';

const exec = promisify(execFile);

const AUTOSAVE_PREFIX = 'autosave/';
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_DEBOUNCE_MS = 60_000;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingReasons = new Map<string, string>();

let gitAvailableCache: boolean | null = null;
let gitCheckErrorCache: string | null = null;

export type SnapshotInfo = {
	ref: string;
	branch: string;
	createdAt: string;
	message: string;
};

export type GitStatus = {
	available: boolean;
	message: string;
	installUrl: string;
};

export class GitUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GitUnavailableError';
	}
}

export function getGitInstallHint(): GitStatus {
	const platform = process.platform;
	let message =
		'Git is required for History / autosave. Install it, then restart the dev server.';
	if (platform === 'darwin') {
		message =
			'Git not found. Install Xcode Command Line Tools (`xcode-select --install`) or run `brew install git`.';
	} else if (platform === 'win32') {
		message =
			'Git not found. Download and install from git-scm.com, then restart Dialogsys.';
	} else {
		message =
			'Git not found. Install via your package manager (e.g. `sudo apt install git`) or from git-scm.com.';
	}
	return {
		available: false,
		message: gitCheckErrorCache ?? message,
		installUrl: 'https://git-scm.com/downloads',
	};
}

export async function checkGitAvailable(): Promise<GitStatus> {
	if (gitAvailableCache === true) {
		return { available: true, message: '', installUrl: 'https://git-scm.com/downloads' };
	}
	try {
		await exec('git', ['--version'], { timeout: 5_000 });
		gitAvailableCache = true;
		gitCheckErrorCache = null;
		return { available: true, message: '', installUrl: 'https://git-scm.com/downloads' };
	} catch (e) {
		gitAvailableCache = false;
		const err = e as NodeJS.ErrnoException;
		if (err.code === 'ENOENT') {
			gitCheckErrorCache = 'Git executable not found on PATH.';
		} else {
			gitCheckErrorCache = err.message || 'Git check failed.';
		}
		return getGitInstallHint();
	}
}

async function requireGit(): Promise<void> {
	const status = await checkGitAvailable();
	if (!status.available) {
		throw new GitUnavailableError(status.message);
	}
}

function retentionDays(): number {
	const n = Number(process.env.SNAPSHOT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

function debounceMs(): number {
	const n = Number(process.env.SNAPSHOT_DEBOUNCE_MS ?? DEFAULT_DEBOUNCE_MS);
	return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DEBOUNCE_MS;
}

function branchTimestamp(branch: string): number | null {
	const raw = branch.replace(/^autosave\//, '');
	const normalized = raw.replace(
		/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/,
		'$1T$2:$3:$4Z',
	);
	const ms = Date.parse(normalized);
	return Number.isFinite(ms) ? ms : null;
}

function snapshotBranchName(): string {
	const iso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
	return `${AUTOSAVE_PREFIX}${iso}`;
}

async function git(
	slug: string,
	args: string[],
): Promise<{ stdout: string; stderr: string }> {
	const cwd = projectDir(slug);
	return exec('git', args, {
		cwd,
		maxBuffer: 4 * 1024 * 1024,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
	});
}

async function gitOk(slug: string, args: string[]): Promise<boolean> {
	try {
		await git(slug, args);
		return true;
	} catch {
		return false;
	}
}

const PROJECT_GITIGNORE = `export/
.dialogsys/
*.tmp
`;

export async function ensureProjectRepo(slug: string): Promise<void> {
	await requireGit();

	const dir = projectDir(slug);
	const gitDir = path.join(dir, '.git');
	try {
		await fs.access(gitDir);
		return;
	} catch {
		/* not initialized */
	}

	await fs.writeFile(path.join(dir, '.gitignore'), PROJECT_GITIGNORE, 'utf-8');
	await git(slug, ['init', '-b', 'main']);
	await git(slug, ['config', 'user.email', 'dialogsys@local']);
	await git(slug, ['config', 'user.name', 'Dialogsys']);
	await git(slug, ['add', '-A']);
	const hasChanges = !(await gitOk(slug, ['diff', '--cached', '--quiet']));
	if (hasChanges) {
		await git(slug, ['commit', '-m', 'Initial project snapshot']);
	}
}

export async function createSnapshot(
	slug: string,
	reason: string,
): Promise<SnapshotInfo | null> {
	const gitStatus = await checkGitAvailable();
	if (!gitStatus.available) return null;

	await ensureProjectRepo(slug);

	const safeReason = reason.slice(0, 200).replace(/[\r\n"]/g, ' ');
	await git(slug, ['add', '-A']);

	const clean = await gitOk(slug, ['diff', '--cached', '--quiet']);
	if (clean) return null;

	await git(slug, ['commit', '-m', `autosave: ${safeReason}`]);
	const branch = snapshotBranchName();
	await git(slug, ['branch', '-f', branch]);

	await pruneOldSnapshots(slug);

	const { stdout } = await git(slug, ['rev-parse', '--short', 'HEAD']);
	const createdAt = new Date().toISOString();

	return {
		ref: stdout.trim(),
		branch,
		createdAt,
		message: safeReason,
	};
}

/** Best-effort snapshot; never throws (autosave must not break saves). */
export async function scheduleSnapshot(
	slug: string,
	reason: string,
	options?: { immediate?: boolean },
): Promise<SnapshotInfo | null> {
	const gitStatus = await checkGitAvailable();
	if (!gitStatus.available) return null;

	try {
		if (options?.immediate || reason.startsWith('manual:')) {
			clearPending(slug);
			return await createSnapshot(slug, reason);
		}

		const existing = pendingTimers.get(slug);
		if (existing) clearTimeout(existing);

		pendingReasons.set(slug, reason);

		return new Promise((resolve) => {
			const timer = setTimeout(async () => {
				pendingTimers.delete(slug);
				const r = pendingReasons.get(slug) ?? reason;
				pendingReasons.delete(slug);
				try {
					resolve(await createSnapshot(slug, r));
				} catch {
					resolve(null);
				}
			}, debounceMs());
			pendingTimers.set(slug, timer);
		});
	} catch {
		return null;
	}
}

function clearPending(slug: string): void {
	const t = pendingTimers.get(slug);
	if (t) clearTimeout(t);
	pendingTimers.delete(slug);
	pendingReasons.delete(slug);
}

export async function listSnapshots(slug: string): Promise<SnapshotInfo[]> {
	const gitStatus = await checkGitAvailable();
	if (!gitStatus.available) return [];

	const dir = projectDir(slug);
	const gitDir = path.join(dir, '.git');
	try {
		await fs.access(gitDir);
	} catch {
		return [];
	}

	let stdout = '';
	try {
		const result = await git(slug, [
			'for-each-ref',
			'--sort=-creatordate',
			'refs/heads/autosave/',
			'--format=%(refname:short)|%(creatordate:iso8601)|%(subject)',
		]);
		stdout = result.stdout;
	} catch {
		return [];
	}

	const snapshots: SnapshotInfo[] = [];
	for (const line of stdout.trim().split('\n').filter(Boolean)) {
		const [branch, createdAt, subject] = line.split('|');
		const message = subject?.replace(/^autosave: /, '') ?? '';
		try {
			const { stdout: refOut } = await git(slug, ['rev-parse', '--short', branch]);
			snapshots.push({
				ref: refOut.trim(),
				branch,
				createdAt: createdAt ?? '',
				message,
			});
		} catch {
			/* skip broken ref */
		}
	}
	return snapshots;
}

export async function pruneOldSnapshots(slug: string): Promise<number> {
	const gitStatus = await checkGitAvailable();
	if (!gitStatus.available) return 0;

	const cutoff = Date.now() - retentionDays() * 86_400_000;
	let pruned = 0;

	let stdout = '';
	try {
		const result = await git(slug, [
			'for-each-ref',
			'--format=%(refname:short)',
			'refs/heads/autosave/',
		]);
		stdout = result.stdout;
	} catch {
		return 0;
	}

	for (const branch of stdout.trim().split('\n').filter(Boolean)) {
		const ts = branchTimestamp(branch);
		if (ts !== null && ts < cutoff) {
			await git(slug, ['branch', '-D', branch]);
			pruned++;
		}
	}

	if (pruned > 0) {
		await gitOk(slug, ['gc', '--prune=now', '--quiet']);
	}

	return pruned;
}

export async function restoreSnapshot(slug: string, ref: string): Promise<void> {
	await requireGit();
	await ensureProjectRepo(slug);

	if (!/^[a-zA-Z0-9/_.-]+$/.test(ref) || ref.includes('..')) {
		throw new Error('Invalid snapshot ref');
	}

	await git(slug, ['checkout', ref, '--', '.']);
	await git(slug, ['add', '-A']);
	await createSnapshot(slug, `manual: restored from ${ref}`);
}

export function getSnapshotConfig() {
	return {
		retentionDays: retentionDays(),
		debounceMs: debounceMs(),
		intervalMs: Number(process.env.SNAPSHOT_INTERVAL_MS ?? 300_000),
	};
}
