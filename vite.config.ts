import { defineConfig } from "vite";

/**
 * The vanilla-TS build. No framework plugin: `index.html` loads `src/main.ts`
 * and everything below it is hand-written DOM.
 *
 *   npm run dev       -> localhost:5174
 *   npm run build     -> dist/  (what `//go:embed dist` consumes)
 */
export default defineConfig({
  // `static/` holds the favicon, robots.txt and the built dataset artifact
  // (`chronoscope.json`); its contents land at the root of dist/.
  publicDir: "static",
  server: { port: 5174 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The Go binary serves these itself; no manifest or SSR shims needed.
    target: "es2022",
  },
});
