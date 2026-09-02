import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Vitest's own config, separate from `vite.config.ts` (which is the build).
 * Until this file existed Vitest fell through to the build config and ran on
 * defaults; nothing here changes how the tests run, only how they are measured.
 *
 * Coverage settings come from #40, which measured `v8` and `istanbul` as
 * byte-identical on this repo's source and picked `v8` on cost. Coverage is a
 * root-only option: it spans both projects below and merges into one report.
 */
export default defineConfig({
  test: {
    // Two environments, one run. `TimelineController` cannot be constructed
    // outside a browser — `create()` needs a canvas that lays out and a
    // renderer to fall back on — so anything touching it runs under Playwright
    // and everything else stays on node, which is an order of magnitude
    // cheaper to start. ADR-0002 and #42 chose browser mode over jsdom +
    // node-canvas; #43 chose to test the controller in place rather than
    // extract a seam for it.
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts", "dataset/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Chromium only, and not merely as a default. `v8` collects
            // coverage through the Chrome DevTools Protocol, so adding a
            // firefox or webkit instance would force the whole run onto
            // `istanbul` and move the number this repo reports (#40).
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],

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
        // Test scaffolding, not source. It lives under src/ so the tests can
        // import it with the same relative-extension rules as everything else,
        // but counting it would inflate the numerator with code that exists
        // only to be executed by tests.
        "src/test-support/**",
        // The dataset entrypoint shells — flag parsing, path anchoring,
        // `console.log` formatting, `process.exit` — because `dataset/lib/`
        // already holds the logic they call. This is the counterpart of
        // `src/main.ts` above and of `main.go` (#54); ADR-0003 and #57 carry
        // the argument.
        //
        // They also cannot be covered in-process. Each does its whole job in
        // its module body, so importing one runs it: `check-artifact.ts` ends
        // in an unconditional `process.exit`, which kills the runner, and
        // `build.ts` would overwrite `static/chronoscope.json` from whatever
        // `dataset/events/` held at the time.
        //
        // They are not untested. `.github/workflows/dataset.yml` runs
        // `npm run validate` and `npm run check:artifact` on every pull
        // request and every push to main, against the real 1181-event
        // dataset, and fails on their exit codes. `build.ts` runs in no
        // workflow, but `check-artifact.ts` calls the same `buildArtifact` +
        // `serializeArtifact` pair and diffs the result against the committed
        // file, so its logic is verified by proxy.
        //
        // A glob, not the three filenames: the tree already encodes the rule —
        // top level is entrypoint, `dataset/lib/` is logic — so a future
        // top-level script is a deliberate choice to be an entrypoint. Note
        // the single `*`: `dataset/lib/` stays measured, and it is where the
        // remaining statements live.
        "dataset/*.ts",
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
