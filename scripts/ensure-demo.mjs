import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = path.join(root, 'seed', 'projects', 'demo');
const dest = path.join(root, 'projects', 'demo');

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

if (!(await exists(path.join(dest, 'project.json')))) {
	await mkdir(dest, { recursive: true });
	await cp(seed, dest, { recursive: true });
}
