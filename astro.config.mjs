// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import { xyflowSsrStub } from './src/lib/vite/xyflow-ssr-plugin.mjs';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  security: {
    checkOrigin: false,
  },
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [svelte()],
  vite: {
    plugins: [xyflowSsrStub()],
    ssr: {
      noExternal: [],
    },
  },
});