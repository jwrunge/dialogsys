/**
 * SSR-safe stubs so @xyflow never runs adoptUserNodes during Astro server render.
 * Client builds use real packages via vite plugin alias (ssr only).
 */

export const BackgroundVariant = { Dots: 'dots', Lines: 'lines', Cross: 'cross' };

export const Position = { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' };

export const SvelteFlow = null;
export const Controls = null;
export const Background = null;
export const MiniMap = null;
export const Handle = null;
