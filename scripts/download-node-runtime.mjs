#!/usr/bin/env node
/**
 * Downloads an official Node.js binary for the given Rust target triple
 * and places it at src-tauri/binaries/dialogsys-node-<triple>[.exe]
 */
import { execSync } from 'node:child_process';
import fs, { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NODE_VERSION = '22.12.0';
const BINARIES_DIR = path.join(ROOT, 'src-tauri', 'binaries');

/** @type {Record<string, string>} */
const TRIPLE_TO_NODE = {
	'aarch64-apple-darwin': 'darwin-arm64',
	'x86_64-apple-darwin': 'darwin-x64',
	'aarch64-pc-windows-msvc': 'win-arm64',
	'x86_64-pc-windows-msvc': 'win-x64',
	'aarch64-unknown-linux-gnu': 'linux-arm64',
	'x86_64-unknown-linux-gnu': 'linux-x64',
};

function targetTriple() {
	return (
		process.env.TAURI_ENV_TARGET_TRIPLE?.trim() ||
		execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim()
	);
}

async function download(url, dest) {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
	}
	if (!res.body) {
		throw new Error(`Empty response body for ${url}`);
	}
	await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractTarXz(archivePath, destDir) {
	const { spawnSync } = await import('node:child_process');
	const result = spawnSync('tar', ['-xJf', archivePath, '-C', destDir], { stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`tar extraction failed for ${archivePath}`);
	}
}

async function extractZip(archivePath, destDir) {
	const { spawnSync } = await import('node:child_process');
	const result = spawnSync('unzip', ['-q', archivePath, '-d', destDir], { stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`unzip extraction failed for ${archivePath}`);
	}
}

async function main() {
	const triple = targetTriple();
	const nodeId = TRIPLE_TO_NODE[triple];
	if (!nodeId) {
		console.log(`Skipping Node runtime download for unsupported triple: ${triple}`);
		return;
	}

	fs.mkdirSync(BINARIES_DIR, { recursive: true });

	const isWin = nodeId.startsWith('win');
	const ext = isWin ? 'zip' : 'tar.xz';
	const archiveName = `node-v${NODE_VERSION}-${nodeId}.${ext}`;
	const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
	const archivePath = path.join(BINARIES_DIR, archiveName);
	const destName = `dialogsys-node-${triple}${isWin ? '.exe' : ''}`;
	const destPath = path.join(BINARIES_DIR, destName);

	if (fs.existsSync(destPath)) {
		console.log(`Node runtime already present: ${destName}`);
		return;
	}

	console.log(`Downloading Node ${NODE_VERSION} for ${triple}…`);
	await download(url, archivePath);

	const extractDir = path.join(BINARIES_DIR, `.extract-${triple}`);
	fs.rmSync(extractDir, { recursive: true, force: true });
	fs.mkdirSync(extractDir, { recursive: true });

	if (isWin) {
		await extractZip(archivePath, extractDir);
	} else {
		await extractTarXz(archivePath, extractDir);
	}

	const extractedRoot = path.join(extractDir, `node-v${NODE_VERSION}-${nodeId}`);
	const nodeBinary = path.join(extractedRoot, isWin ? 'node.exe' : 'bin/node');
	if (!fs.existsSync(nodeBinary)) {
		throw new Error(`Node binary not found at ${nodeBinary}`);
	}

	fs.copyFileSync(nodeBinary, destPath);
	fs.chmodSync(destPath, 0o755);
	fs.rmSync(extractDir, { recursive: true, force: true });
	fs.rmSync(archivePath, { force: true });

	console.log(`Installed ${destName}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
