import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubPath = path.resolve(__dirname, 'xyflow-ssr-stub.ts');

const XYFLOW_PACKAGES = ['@xyflow/svelte', '@xyflow/system'];

/** @returns {import('vite').Plugin} */
export function xyflowSsrStub() {
	return {
		name: 'dialogsys-xyflow-ssr-stub',
		enforce: 'pre',
		resolveId(source, _importer, options) {
			if (!options?.ssr) return null;
			if (XYFLOW_PACKAGES.includes(source)) return stubPath;
			if (source.startsWith('@xyflow/svelte/')) return stubPath;
			return null;
		},
	};
}
