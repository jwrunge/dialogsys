#!/usr/bin/env node
/**
 * Sync app version from package.json into Rust crate manifests.
 *
 * Tauri reads bundle/mobile version directly from package.json via
 * src-tauri/tauri.conf.json ("version": "../package.json"). This script
 * only updates Cargo.toml files that Cargo does not auto-resolve.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readPackageVersion() {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	const version = pkg.version?.trim();
	if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
		throw new Error(`Invalid or missing version in package.json: ${version}`);
	}
	return version;
}

function updateCargoToml(filePath, version) {
	let content = fs.readFileSync(filePath, 'utf8');
	const pattern = /^version = "[^"]+"/m;
	if (!pattern.test(content)) {
		throw new Error(`version field not found in ${filePath}`);
	}
	content = content.replace(pattern, `version = "${version}"`);
	fs.writeFileSync(filePath, content);
}

function main() {
	const version = readPackageVersion();
	updateCargoToml(path.join(ROOT, 'src-tauri', 'Cargo.toml'), version);
	updateCargoToml(path.join(ROOT, 'sync-server', 'Cargo.toml'), version);
	console.log(`Synced Rust crate version ${version} from package.json`);
	console.log('Tauri bundle version is read from package.json via tauri.conf.json');
}

main();
