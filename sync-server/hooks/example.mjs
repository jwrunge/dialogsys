#!/usr/bin/env node
/**
 * Example sync-server hook. Receives JSON on stdin:
 * { "event": "beforeWrite", "project": "demo", "path": "dialogs/foo.graph.json", ... }
 * Exit 0 to allow; exit 1 to reject; print { "error": "message" } to stderr to reject with message.
 */
import fs from 'node:fs';

const input = fs.readFileSync(0, 'utf-8');
const payload = JSON.parse(input);
if (payload.event === 'beforeWrite' && payload.path?.endsWith('.git/')) {
	console.error(JSON.stringify({ error: 'Cannot write .git paths via sync server' }));
	process.exit(1);
}
process.exit(0);
