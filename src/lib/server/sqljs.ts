import { createRequire } from 'node:module';
import type { SqlJsStatic } from 'sql.js';

const require = createRequire(import.meta.url);

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

/** Load sql.js in Node/Vite SSR (default ESM import is unreliable when bundled). */
export function resolveInitSqlJs(): InitSqlJs {
	const mod = require('sql.js/dist/sql-wasm.js') as InitSqlJs | { default: InitSqlJs };
	return typeof mod === 'function' ? mod : mod.default;
}
