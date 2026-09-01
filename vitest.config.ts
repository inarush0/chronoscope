import { defineConfig } from "vitest/config";

/**
 * Vitest's own config, separate from `vite.config.ts` (which is the build).
 * Until this file existed Vitest fell through to the build config and ran on
 * defaults; nothing here changes how the tests run, only how they are measured.
 *
 * Coverage settings come from #40, which measured `v8` and `istanbul` as
 * byte-identical on this repo's source and picked `v8` on cost.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",

      // The globs are the whole point. Vitest's default denominator is "files
      // a test imported", which here is five files reading ~50%; the honest
      // repo-wide number over every source file is ~10%. Measuring the second
      // is what #38 is for.
      include: ["src/**/*.ts", "dataset/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        // App-shell wiring — toolbar listeners, SVG constants, theme toggle.
        // Ruled out of scope on #38: its bugs are integration bugs a unit test
        // would not catch. ~144 lines of denominator, given up knowingly.
        "src/main.ts",
      ],

      // Four reporters, one run. `text` is redirected to a file so the CI job
      // can paste the per-file table into the step summary without re-running;
      // `html` rather than `lcov`, which writes lcov.info *and* a duplicate
      // HTML tree nothing reads.
      reporter: [
        // maxCols because the default 80 elides the left column to
        // `...Controller.ts` — and TimelineController.ts is the one file the
        // backfill turns on. A job summary is not a terminal; it can afford it.
        ["text", { file: "coverage.txt", maxCols: 120 }],
        "text-summary",
        "json-summary",
        "html",
      ],
    },
  },
});
