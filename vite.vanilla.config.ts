import { defineConfig } from "vite";

/**
 * The vanilla-TS build (wayfinder ticket #11). Lives alongside the SvelteKit
 * `vite.config.ts` rather than replacing it, so the old app stays runnable for
 * side-by-side parity comparison until the shell port (#13) deletes Svelte.
 * At that point this file becomes `vite.config.ts`.
 *
 *   npm run dev:vanilla     -> localhost:5174
 *   npm run build:vanilla   -> dist/  (what `//go:embed dist` consumes)
 */
export default defineConfig({
  // Reuse SvelteKit's static dir rather than introducing a second one; its
  // contents land at the root of dist/ (favicon.svg, robots.txt).
  publicDir: "static",
  server: { port: 5174 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The Go binary serves these itself; no manifest or SSR shims needed.
    target: "es2022",
  },
});
