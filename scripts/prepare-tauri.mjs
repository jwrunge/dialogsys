#!/usr/bin/env node
/**
 * Prepares bundled web assets and Node runtime for Tauri release builds.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_RESOURCE = path.join(ROOT, 'src-tauri', 'resources', 'web');

function run(cmd, args, opts = {}) {
	const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function copyDir(src, dest) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.cpSync(src, dest, { recursive: true });
}

function main() {
	console.log('Building Astro app…');
	run('npm', ['run', 'build']);

	const dist = path.join(ROOT, 'dist');
	if (!fs.existsSync(path.join(dist, 'server', 'entry.mjs'))) {
		console.error('Missing dist/server/entry.mjs — build failed?');
		process.exit(1);
	}

	console.log('Copying web assets into src-tauri/resources/web…');
	fs.rmSync(WEB_RESOURCE, { recursive: true, force: true });
	fs.mkdirSync(WEB_RESOURCE, { recursive: true });
	copyDir(dist, path.join(WEB_RESOURCE, 'dist'));
	copyDir(path.join(ROOT, 'seed', 'projects'), path.join(WEB_RESOURCE, 'seed', 'projects'));

	console.log('Downloading Node runtime for target triple…');
	execSync('node scripts/download-node-runtime.mjs', { stdio: 'inherit', cwd: ROOT });

	console.log('Tauri resources ready.');
}

main();
