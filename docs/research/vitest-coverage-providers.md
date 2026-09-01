# Choosing the TypeScript coverage provider

Research for [#40](https://github.com/inarush0/chronoscope/issues/40), a sub-issue
of [map #38](https://github.com/inarush0/chronoscope/issues/38). Unlike the
survey on [#39](https://github.com/inarush0/chronoscope/issues/39), **this note
picks one** — the ticket asks for a decision, not a menu.

Investigated 2026-09-01. Everything marked **measured** was run on **node
v24.18.0, darwin arm64 (Darwin 25.5.0)** against **vitest 4.1.11**,
**@vitest/coverage-v8 4.1.11**, **@vitest/coverage-istanbul 4.1.11**,
**vite 7.3.6 / esbuild 0.28.2**, **pixi.js 8.20.1**, in a throwaway copy of this
repo at `/tmp/covrepo` (`rsync` of the working tree plus the two coverage
packages). Nothing in this repo was modified: no dependency added, no config
touched, no file under `src/` or `dataset/` changed. Everything marked **read**
comes from the version-pinned docs (`raw.githubusercontent.com/vitest-dev/vitest/v4.1.11/…`),
the vitest source at tag `v4.1.11`, or the installed package under
`node_modules/`.

The headline is short: **use `v8`**, because on this repo's actual source the two
providers produce *identical* line, branch and function results while `v8` costs
a quarter of the wall clock — and because the sharp edge everyone expected
(browser mode) turned out not to be sharp, both providers work there.

---

## 1. `v8` vs `istanbul`

### What each one actually does in 4.1.11

`v8` collects native V8 coverage (`node:inspector` in node, Chrome DevTools
Protocol `Profiler.takePreciseCoverage` in a browser) and remaps the ranges onto
source positions afterwards. `istanbul` pre-instruments every included file with
Babel, injecting counter increments, and reads the counters out of a global
after the run
([Coverage guide](https://vitest.dev/guide/coverage)).

The single most important thing to know about Vitest 4 here is that **v8's old
inaccuracy is gone, and the flag you would have looked for no longer exists**.
From the v4 migration guide (read, `docs/guide/migration.md` at tag `v4.1.11`):

> In the past Vitest used [`v8-to-istanbul`] for remapping V8 coverage results
> into your source files. This method wasn't very accurate and provided plenty of
> false positives … We've now developed a new package that utilizes AST based
> analysis for the V8 coverage. This allows V8 reports to be as accurate as
> `@vitest/coverage-istanbul` reports.
>
> - `coverage.ignoreEmptyLines` is removed. Lines without runtime code are no
>   longer included in reports.
> - **`coverage.experimentalAstAwareRemapping` is removed. This option is now
>   enabled by default, and is the only supported remapping method.**
> - `coverage.ignoreClassMethods` is now supported by V8 provider too.

Confirmed against the installed packages rather than taken on trust:

- `vitest@4.1.11`'s `CoverageOptions` interface
  (`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:701`) has **no**
  `experimentalAstAwareRemapping`, no `ignoreEmptyLines`, and no `all`. So there
  is nothing to switch on — asking for AST-aware remapping in config is a type
  error in 4.1.11.
- `@vitest/coverage-v8@4.1.11`'s dependencies contain `ast-v8-to-istanbul@1.0.5`
  and **do not contain `v8-to-istanbul` at all**. The old remapper is not even
  installed.

So the accuracy question is no longer "v8 or istanbul", it is "does
`ast-v8-to-istanbul` land on the right lines after esbuild has stripped the
types". Which is testable.

### Accuracy through esbuild's type-stripping — measured

Vite transforms TS with esbuild and does not type-check; `transformWithEsbuild`
in the sandbox reports **vite 7.3.6 / esbuild 0.28.2**. I ran the whole repo
under both providers with an identical repo-wide `include`, emitted the `json`
reporter from each, and diffed the two `coverage-final.json` files
programmatically.

**Result: the two providers agree exactly on every percentage, for all fifteen
files.**

```
All files          |   10.42 |    12.66 |   13.91 |   10.96      <- v8
All files          |   10.42 |    12.66 |   13.91 |   10.96      <- istanbul
```

Per-file `statementMap` / `branchMap` / `fnMap` cardinalities are equal for all
14 files both providers report (`TimelineController.ts` 349/95/41,
`timelineView.ts` 116/17/23, `events.ts` 76/20/9, and so on). The structural
diff found **36 entries that differ**, and every single one is one of three
cosmetic classes:

1. **Column offsets on the same line.** e.g. `dataset/lib/events.ts:179` starts
   at column 8 for v8 and column 16 for istanbul. Same line, so line/statement
   coverage is unaffected; only HTML highlight extents move.
2. **Function `decl` start columns and names.** For
   `TimelineController.ts:157` (`static async create`) v8's decl starts after
   the `static ` keyword, istanbul's at the indent; for `viewport.ts:26` (a
   `get` accessor) likewise. v8 also names class members correctly
   (`constructor`, `next`, `label`) where istanbul reports `(anonymous_N)` —
   istanbul instruments *after* esbuild has already rewritten the class, so it
   has lost the names. A point for v8's HTML report readability.
3. **Hit counts, never hit/not-hit status.** `dataset/lib/dates.ts` statement 7
   is `16` for v8 and `14` for istanbul. Both are non-zero, so no metric moves.

**Type-only constructs cost nothing under either provider.** A purpose-built
probe (`probe/constructs.ts`, 97 lines) exercising `import type`, `interface`,
`type`, `declare`, overload signatures, `satisfies`, `as const`, `abstract`,
`declare` fields, definite-assignment `!`, and `const` type parameters was
reported *identically* by both:

```
 constructs.ts |   82.14 |    76.92 |   83.33 |   80.76 | 41,75,94-97
```

Lines 41, 75 and 94–97 are exactly `return x + 1` in an unhit overload
implementation branch, an uncalled method body, and an uncalled function body.
No erased construct was charged to anybody.

**What *does* cost you, equally under both, is generated runtime code.** esbuild
turns enums and namespaces into IIFEs:

```js
export var Level = /* @__PURE__ */ ((Level2) => {
  Level2[Level2["Low"] = 1] = "Low";
  …
})(Level || {});
```

so each `enum` (including `const enum` when exported — esbuild does not inline
it) and each `namespace` adds ~3 statements, 1 function and 1 `binary-expr`
branch to the denominator, attributed to the declaration line. Fully covered
when the enum is imported and used; a dead 0% when the file is never loaded.
This repo currently declares no enums or namespaces, so it is a "don't start"
note rather than a finding.

**Class fields, parameter properties and accessors are handled correctly by
both**: the probe's `count = 0` field initialiser and the `at: Time = 0`
parameter-property default both appear (the latter as a `default-arg` branch),
while the `declare phantom` and `later!` fields correctly produce nothing.

**Decorators were not tested and are irrelevant here** — esbuild only supports
the legacy `experimentalDecorators` form, this repo sets neither that nor any
decorator, and none of `src/` or `dataset/` uses one.

### The one place they genuinely disagree — measured

There is exactly one behavioural divergence I could produce, and it is worth
recording because it points the *wrong* way for a repo whose stated goal is an
honest number.

Running the real `src/inspector/inspector.ts` under browser mode, v8 reported
75% branch coverage and istanbul 70%. The disagreement is a single branch:

```
v8:        if@91:4  [1,1]
istanbul:  if@91:4  [1,0]
```

Line 91 is `if (panel.parentNode !== parent) parent.append(panel);`. The test
called `show()` once with an event, so the implicit else was never taken.
**Istanbul is right; v8 reports the implicit else as covered when it is not.**

Minimised to 24 lines, and it reproduces identically in node and in browser mode
(so it is not a browser artefact). Three variants of the same closure, each
called once with a value and once with `null`:

| Variant | Statement before the `if` | v8 | istanbul |
| --- | --- | --- | --- |
| `w1` | `const label = e.k;` | `[1,0]` | `[1,0]` |
| `w2` | `const label = e.k \|\| "none";` | `[1,1]` ✗ | `[1,0]` |
| `w3` | `const label = e?.k;` | `[1,1]` ✗ | `[1,0]` |

The trigger is a **short-circuiting operator (`??`, `||`, `?.`) earlier in the
same function whose skipped arm is never taken**; the following `if`'s implicit
else is then reported as covered. Block or no block on the `if` makes no
difference. This is *not* one of the two limitations
[`ast-v8-to-istanbul` documents](https://github.com/AriPerkkio/ast-v8-to-istanbul#limitations)
(uncovered `AssignmentPattern`s, and blocks truncated by a throw), so it is
either a third one or a bug; I did not file it.

Scale: across this whole repo the effect was **0.26 percentage points of branch
coverage** in the only run where any file exercised it (16.53% v8 vs 16.27%
istanbul), and **zero** on statements, lines and functions. It errs in the
flattering direction, on the metric this map cares about least.

### Cost — measured

Five runs each of the existing three test files (32 tests), best-of shown as the
observed steady state (`/usr/bin/time -p`, warm):

| | wall clock | delta over no coverage |
| --- | --- | --- |
| no coverage | 0.77s | — |
| `v8` | 0.92s | **+0.15s** |
| `istanbul` | 1.33s | **+0.56s** |

Istanbul's overhead is ~3.7× v8's. In the mixed node + browser run the gap shows
up in the transform phase, which is where Babel instrumentation lives: **115ms
(v8) vs 821ms (istanbul)**, total run 1.18s vs 1.58s. Both are negligible in
absolute terms today; the ratio is what will matter once the render loop is
under test and the file count triples.

### Which one survives #42's construction options

This was flagged on #39 as **unverified** and as the thing that "shapes #40 and
#45 as much as #42". It is now verified, and the answer is reassuring.

**Browser mode (Playwright/chromium): both providers work, and both merge the
node project and the browser project into one number.** Measured. Config was one
root-level `test.coverage` block plus `test.projects` — a `node` project holding
the three existing test files and a `browser` project holding a test that calls
`Application.init` against real WebGL and drives `createInspector` against a real
DOM:

```
 ✓  node  src/format.test.ts (3 tests) 3ms
 ✓  node  src/timeline/viewport.test.ts (16 tests) 5ms
 ✓  node  dataset/lib/events.test.ts (13 tests) 7ms
 ✓  browser (chromium)  bro/browser.test.ts (2 tests) 39ms

All files          |   16.73 |    16.53 |   17.39 |    17.8
  format.ts        |     100 |      100 |     100 |     100     <- from the node project
  theme.ts         |     100 |      100 |     100 |     100     <- pulled in by the browser test
  inspector.ts     |     100 |       75 |     100 |     100     <- from the browser project
  viewport.ts      |   86.95 |        0 |   76.92 |   86.95     <- from the node project
```

One report, one table, one set of totals, files from both projects, correct
source mapping in both. Identical structure under `provider: 'istanbul'`. This
closes loose end 1 on #39.

Why both work, from the source at tag `v4.1.11`:

- `packages/browser/src/node/plugin.ts:219-238` explicitly resolves **either**
  `@vitest/coverage-v8` **or** `@vitest/coverage-istanbul` (or a custom module)
  into the browser's optimizer entries. Browser mode is not v8-only.
- v8 in the browser goes through CDP: `packages/coverage-v8/src/browser.ts`
  triggers the `__vitest_startV8Coverage` / `__vitest_takeV8Coverage` browser
  commands, which are `Profiler.enable` + `Profiler.startPreciseCoverage` on a
  CDP session (`packages/browser/src/node/commands/coverage.ts`).
- That CDP session comes from `provider.getCDPSession`
  (`packages/browser/src/node/projectParent.ts:194`, which throws
  `CDP is not supported by the provider "<name>"` when absent). Playwright
  implements it via `page.context().newCDPSession(page)`
  (`packages/browser-playwright/src/playwright.ts:536`).

**The constraint that follows: with the `v8` provider, browser mode must be
Chromium.** `newCDPSession` is a Chromium-only Playwright API, and the docs
already rule out non-V8 engines ("Does not work on environments that don't use
V8, such as Firefox"). #39 picked chromium anyway, so this costs nothing today —
but if #42 or a later ticket ever wants firefox or webkit in the matrix, that
run needs `istanbul`. Istanbul instruments the source and needs no CDP at all.

**jsdom + node-canvas (#39's option B): nothing changes.** That is an ordinary
node-pool run with a different `environment`, so it is the same `node:inspector`
path already measured above. Not separately verified, because there is nothing
provider-specific to verify — the environment is swapped inside the same worker.

**The seam (#39's option E): nothing changes.** Plain node.

So the provider choice does **not** constrain #42, and #42 does not constrain the
provider choice. They are independent. That is the most useful thing this
investigation found.

### Recommendation

**`provider: 'v8'`.**

Identical line/statement/function results to istanbul on this repo's real source
(measured over 15 files), a quarter of the overhead, no pre-instrumentation step
to perturb Pixi in a browser run, better function names in the HTML report, and
it is the default so it is what the next contributor expects. The branch-coverage
divergence is real but is 0.26pp on the metric the map is least interested in.

And the escape hatch is cheap: `include`, `exclude` and `reporter` are entirely
provider-agnostic (both providers accept the same keys and feed the same
`istanbul-lib-report` pipeline), so switching is a one-word edit if the branch
inaccuracy ever bites.

---

## 2. `include` globs that make the denominator repo-wide

### What 4.1.11 does by default

`coverage.all` **does not exist in Vitest 4**. From the migration guide:

> In Vitest v4 we have removed `coverage.all` completely and **defaulted to
> include only covered files in the report**.
>
> When upgrading to v4 it is recommended to define `coverage.include` in your
> configuration, and then start applying simple `coverage.exclude` patterns if
> needed.

Confirmed in the installed `coverageConfigDefaults`
(`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:15`): there is **no
`include` key at all** and `exclude` defaults to `[]`. The config reference
states `coverage.include`'s default as "Files that were imported during test
run".

This is exactly the trap the ticket describes, and it is measurable. Default
config, no `include`, on this repo today:

```
All files    |   50.31 |    50.51 |   55.17 |   52.73
```

**50.31%** — over five files, because only five were ever imported.
`TimelineController.ts`, `timelineView.ts`, `inspector.ts`, `theme.ts`,
`dataset.ts`, `artifact.ts`, `build.ts`, `validate.ts` and `check-artifact.ts`
simply do not appear. With a repo-wide `include` the same run reads **10.42%**.
A default config would report a number five times too kind.

### Concrete config for this repo

```ts
// vite.config.ts — Vitest reads `test` out of the existing Vite config; this
// repo has no separate vitest.config.ts and does not need one.
test: {
  coverage: {
    provider: "v8",
    // The denominator. Without this, Vitest reports only the files a test
    // happened to import — 50.31% over five files instead of 10.42% over
    // fifteen. Extensions are spelled out because the docs recommend it.
    include: ["src/**/*.ts", "dataset/**/*.ts"],
    exclude: [
      "**/*.test.ts",
      "**/*.d.ts",
      "src/main.ts",
    ],
    reporter: [
      ["text", { file: "coverage.txt", maxCols: 100 }],
      ["text-summary", { file: "summary.txt" }],
      ["json-summary", { file: "coverage-summary.json" }],
      "html",
    ],
    reportsDirectory: "./coverage",
  },
}
```

Measured output of exactly that block, on `main` as of this note:

```
Statements   : 10.42% ( 81/777 )
Branches     : 12.66% ( 49/387 )
Functions    : 13.91% ( 16/115 )
Lines        : 10.96% ( 77/702 )
```

Two mechanical notes:

- **`coverage` is a root-level option only.** If #42 lands `test.projects` for
  browser mode, this block stays at the root and is *not* repeated per project:
  "coverage: coverage is done for the whole process"
  ([projects guide](https://vitest.dev/guide/projects)). Verified by the mixed
  run above, which used precisely this shape.
- **`include` is matched before `exclude`** ("Files are first checked against
  `coverage.include`"), which is why nothing here needs to exclude
  `node_modules`, `dist/`, `static/`, `vite.config.ts` or the Go files: the
  include globs never reach them.

### The undecided part: does `dataset/` belong in the denominator?

The map's fog says this is open ("Whether the dataset tooling needs seams at
all"). **I am not deciding it**, but here is the number it turns on, measured:

| `include` | statements | headline |
| --- | --- | --- |
| `src/**/*.ts` + `dataset/**/*.ts` | 777 | **10.42%** |
| `src/**/*.ts` only | 549 | **4.00%** |

**Including `dataset/` more than doubles the reported percentage.** That is
because `dataset/lib/events.ts` is one of only three files with tests
(`dataset/lib/events.test.ts`, from #35), so the dataset half of the tree is
currently the *better*-covered half.

The tradeoff, stated so it can be argued in a PR:

- **For including it.** `dataset/lib/events.ts` already has a test suite that
  the CI job runs. Reporting a TS number that omits the code those tests cover,
  while still running them, is its own kind of dishonesty — and it would make
  the exemplar test from #35 invisible. `AGENTS.md` treats `dataset/` as first
  class (`npm run check:dataset`, its own tsconfig, its own CI workflow).
- **Against including it.** The 228 statements in `build.ts`, `validate.ts`,
  `check-artifact.ts` and `artifact.ts` are build-time scripts that read and
  write real files, not shipped application code; none of it is inside the Go
  binary. Folding them into the same percentage as the app makes "TypeScript
  coverage" mean two different things at once, which is the exact objection
  decision 2 raises against blending Go and TS.
- **A third option nobody has proposed yet**: `include` everything but let the
  reporter's directory rollup carry the story — the `text` table already prints
  `dataset`, `dataset/lib`, `src`, `src/inspector` and `src/timeline` as
  separate rows with their own percentages, so one repo-wide denominator does not
  actually hide the split.

Whichever way #43/#45 goes, the choice must be recorded, because it moves the
headline by 6.4 points and the 80% goal is measured against it.

---

## 3. The `exclude` list

### Vitest 4.1.11's defaults, from the installed source

`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:15` —
`coverageConfigDefaults` in full:

```js
{
  provider: "v8",
  enabled: false,
  clean: true,
  cleanOnRerun: true,
  reportsDirectory: "./coverage",
  exclude: [],                                   // <- note
  reportOnFailure: false,
  reporter: ["text", "html", "clover", "json"],
  allowExternal: false,
  excludeAfterRemap: false,
  processingConcurrency: min(20, availableParallelism()),
  ignoreClassMethods: [],
  skipFull: false,
  watermarks: { statements: [50,80], functions: [50,80], branches: [50,80], lines: [50,80] },
}
```

**`coverage.exclude` defaults to the empty array.** There is no inherited
`configDefaults.coverage.exclude` list to spread — the v3-era list of default
coverage exclusions is gone along with `coverage.all`. (Do not confuse this with
`test.exclude`, which still defaults to `["**/node_modules/**", "**/.git/**"]`
and governs which *test files run*, not which source files are counted.)

So every exclusion below is one we are choosing, and owes a justification.

### What this repo needs, each with its out-loud reason

| Pattern | Why, in one sentence you could say in review |
| --- | --- |
| `**/*.test.ts` | Test files are the measuring instrument, not the thing measured; counting them inflates the number by construction, since a test file is by definition 100% executed. Required by the ticket. |
| `**/*.d.ts` | **Measured necessity, not hygiene.** `src/**/*.ts` matches `src/globals.d.ts`, which then appears as a 0%/0-statement row in the table. It is a declaration file with no runtime code; it can never be covered and nobody could ever fix it. |
| `src/main.ts` | Ruled out on the map (decision 7 / "Out of scope") as app-shell wiring whose bugs are integration bugs. **Measured cost: 59 statements and 54 lines** — the denominator goes 836 → 777 statements, moving the headline from 9.68% to 10.42%. That is the size of the lie we are knowingly telling, and it is small. |

**Deliberately *not* excluded**, because each would be a lie of a size worth
naming:

- `src/timeline/TimelineController.ts` and `src/timeline/timelineView.ts` — 465
  statements, 60% of the whole denominator, currently 0%. Excluding them is
  exactly the goalpost-move decision 1 forbids.
- `src/theme.ts`, `src/dataset.ts`, `src/inspector/inspector.ts` — in scope per
  decision 7, and the browser-mode run proved `inspector.ts` reaches 100% line
  coverage from a single test.
- `node_modules`, `dist/`, `static/`, `vite.config.ts`, the Go files — nothing to
  exclude, because `include` never reaches them. Adding defensive patterns for
  them would imply they were at risk and invite a reader to look for the trick.

### One judgement call left open

`src/timeline/types.ts` (13 lines, pure `type`/`interface` declarations) shows
in the report **under `v8` only**, as a `0 | 0 | 0 | 0` row with no uncovered
line numbers; `istanbul` omits it entirely. Measured: it contributes **zero**
statements, so excluding it changes no percentage — 10.42% either way. It is
purely a question of whether a permanent 0% row that can never move is more
confusing than an exclusion line. I have left it *in* in the config above (fewer
exclusions to defend), and note it here so #45 can drop it if the table reads
badly. If it is excluded, the honest reason is "it contains no runtime code",
which is the same reason as `**/*.d.ts` — arguably `**/types.ts` should just be
handled by whoever writes the CI job noticing that v8 lists empty files.

### `excludeAfterRemap`

Left at its default (`false`). It exists for "when your source files are
transpiled and may contain source maps of non-source files", diagnosed by seeing
files in the report that match your `exclude`. Measured: that does not happen
here — the report contained exactly the expected 15 files. Do not add it
speculatively.

---

## 4. Reporters

### The exact ids Vitest ships

`CoverageReporter` is `keyof ReportOptions`
(`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:596-610`), i.e. the
istanbul-reports set, confirmed against `istanbul-reports@3.2.0`'s `lib/`
directory:

| id | emits |
| --- | --- |
| `text` | ASCII per-file table to stdout, or to `reportsDirectory/<file>` if given `{ file }` |
| `text-summary` | four-line totals block (Statements/Branches/Functions/Lines with `n/m`) |
| `text-lcov` | LCOV to stdout |
| `json` | `coverage-final.json` — full statement/branch/function maps and hit counts |
| `json-summary` | `coverage-summary.json` — per-file and total percentages only |
| `html` | browsable multi-page report (`index.html` + per-directory pages) |
| `html-spa` | single-page variant with a metrics filter |
| `lcov` | `lcov.info` **plus** an `lcov-report/` HTML tree |
| `lcovonly` | `lcov.info` alone |
| `clover`, `cobertura`, `teamcity` | XML/service formats for external tooling |
| `none` | nothing |

Default is `['text', 'html', 'clover', 'json']`. There is **no markdown
reporter**, so a GitHub job summary gets a fenced `text` table, not a native
markdown table — which is fine, and is exactly what #41 settled for the Go side.

### What the CI job needs, measured end to end

```ts
reporter: [
  ["text", { file: "coverage.txt", maxCols: 100 }],
  ["text-summary", { file: "summary.txt" }],
  ["json-summary", { file: "coverage-summary.json" }],
  "html",
],
reportsDirectory: "./coverage",
```

Ran it; `coverage/` contained `coverage.txt`, `summary.txt`,
`coverage-summary.json`, and the `html` tree (`index.html`, `src/`, `dataset/`,
assets). The pieces map onto #41's three-part shape one for one:

- **Headline** → `text-summary` with `{ file }`. Writes
  `Statements : 10.42% ( 81/777 )` and three siblings. This is the TS
  counterpart to the Go headline, and `json-summary`'s `total` object carries the
  same numbers if the job would rather compute the headline itself:
  `{"total":{"lines":{"total":702,"covered":77,"pct":10.96}, …}}`.
- **Per-file table for `$GITHUB_STEP_SUMMARY`** → `text` with
  `{ file: "coverage.txt", maxCols: 100 }`. `maxCols` bounds the width so the
  table does not wrap inside the summary's code fence. Actual output, verbatim:

  ```
  ------------------------|---------|----------|---------|---------|-------------------
  File                    | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
  ------------------------|---------|----------|---------|---------|-------------------
  All files               |   10.42 |    12.66 |   13.91 |   10.96 |
   dataset                |       0 |        0 |       0 |       0 |
    build.ts              |       0 |        0 |       0 |       0 | 25-66
  …
   src/timeline           |    4.09 |        0 |   12.98 |    4.57 |
    TimelineController.ts |       0 |        0 |       0 |       0 | 14-720
    timelineView.ts       |       0 |        0 |       0 |       0 | 24-252
    viewport.ts           |   86.95 |        0 |   76.92 |   86.95 | 70-80
  ------------------------|---------|----------|---------|---------|-------------------
  ```

  Note the `{ file }` option **redirects** the table — it stops printing to
  stdout. If the CI log should also show it, list `text` twice (once bare, once
  with `file`) or `cat` the file.
- **HTML artifact** → `html`. Prefer it over `lcov`: `lcov` writes *both*
  `lcov.info` and a duplicate `lcov-report/` HTML tree, so you would upload the
  same report twice. Add `lcovonly` instead if a machine-readable LCOV is ever
  wanted; `json-summary` already covers the "read the number back in a script"
  case (a future ratchet, deliberately deferred on the map) at a fraction of
  `json`'s size.

### Comparability with `go tool cover -func`

Honest statement of the gap: **there is no per-function reporter in
istanbul-reports**, so nothing produces a row-per-function table like
`cover -func`. The closest analogue is `text`, which is row-per-**file** with
four metrics plus uncovered line ranges — arguably more informative per row, and
it renders in a code fence exactly the same way. So the two summaries sit side by
side as:

```
### Go            70.0%     [cover -func table, per function]
### TypeScript    10.42%    [vitest text table, per file]
```

which satisfies decision 2 (two numbers, never blended) and #41's single-job
constraint: `npm run test -- --coverage` writes `coverage/coverage.txt`, the same
job appends it to `$GITHUB_STEP_SUMMARY` after the Go table, and both HTML
outputs upload as artifacts from that one job.

---

## Things #42 and #45 must watch out for

1. **Vitest silences the coverage table when it thinks an agent is running it.**
   `coverageConfigDefaults` is not the whole story: 4.1.11 detects AI coding
   agents via `std-env`'s `isAgent` (env vars `CLAUDECODE`, `CLAUDE_CODE`,
   `AI_AGENT`, `CURSOR_AGENT`, …) and then "adds the `text-summary` reporter and
   sets `skipFull: true` on the `text` reporter"
   ([config reference](https://vitest.dev/config/coverage#coverage-reporter)).
   Measured: my first baseline run silently omitted `src/format.ts` — the only
   100%-covered file in the repo — until I re-ran with those variables unset.
   GitHub Actions does not set them, so **CI is unaffected**, but a developer or
   agent running the command locally sees a *different table* from CI. Anyone
   comparing local output to a job summary needs to know this. Every measurement
   in this note was taken with `env -u CLAUDECODE -u CLAUDE_CODE -u AI_AGENT`.
2. **`v8` + browser mode means Chromium, permanently.** Fine for #39's choice;
   it forecloses firefox/webkit in the browser matrix unless the provider changes
   to `istanbul` for that run.
3. **`--coverage.exclude` on the CLI does not compose the way you would hope.**
   Passing it repeatedly to override a config `exclude` produced a report with
   every metric at 0% in my hands. Configure exclusions in the config file, not
   on the command line.
4. **Coverage config is root-level under `test.projects`.** Do not duplicate the
   block into the node and browser projects.
5. All measurements are **darwin arm64**; CI is ubuntu. Nothing here is
   platform-sensitive in principle (no native coverage dependency: `v8` uses
   `node:inspector`, `istanbul` uses Babel), but the wall-clock figures are not
   ubuntu figures, and the Playwright half inherits every caveat #39 recorded.
6. **The `10.42%` baseline in this note is a moving target** — it was measured on
   `main` at commit `6b8045d` with three test files. #43's measurement ticket
   should re-take it rather than quoting this number.

## Still open

- **Whether `dataset/**/*.ts` is in the denominator** (§2). Not mine to decide;
  worth 6.4 percentage points.
- **Whether `src/timeline/types.ts` gets an explicit exclusion** (§3). Zero
  numeric effect; purely a readability call for whoever writes the CI job.
- **Whether the v8 implicit-else divergence is a known bug.** I reproduced and
  minimised it but did not search the `ast-v8-to-istanbul` issue tracker or file
  anything. If it turns out to be fixed upstream, the last argument for
  `istanbul` disappears entirely.
- **Whether a threshold is ever configured.** `coverage.thresholds` exists and
  supports negative values ("no more than N uncovered lines") and per-glob
  thresholds — deliberately unused, since the map excludes making coverage block
  a merge, and a threshold is a merge gate wearing a different hat.

## Sources

- [Vitest coverage guide](https://vitest.dev/guide/coverage) and
  [coverage config reference](https://vitest.dev/config/coverage), read at tag
  `v4.1.11` (`docs/guide/coverage.md`, `docs/config/coverage.md`)
- [Vitest v4 migration guide](https://vitest.dev/guide/migration), tag `v4.1.11`
  — "V8 Code Coverage Major Changes" and "Removed Options `coverage.all` and
  `coverage.extensions`"
- [Vitest projects guide](https://vitest.dev/guide/projects), tag `v4.1.11` —
  "coverage is done for the whole process"
- Vitest source at tag `v4.1.11`: `packages/browser/src/node/plugin.ts`,
  `packages/browser/src/node/commands/coverage.ts`,
  `packages/browser/src/node/projectParent.ts`,
  `packages/browser-playwright/src/playwright.ts`,
  `packages/coverage-v8/src/browser.ts`, `packages/coverage-istanbul/src/index.ts`
- Installed packages: `vitest@4.1.11`
  (`dist/chunks/defaults.9aQKnqFk.js`, `dist/chunks/reporters.d.DtoKVV2s.d.ts`),
  `@vitest/coverage-v8@4.1.11`, `@vitest/coverage-istanbul@4.1.11`,
  `ast-v8-to-istanbul@1.0.5`, `istanbul-reports@3.2.0`, `std-env`
- [`ast-v8-to-istanbul` README — Limitations](https://github.com/AriPerkkio/ast-v8-to-istanbul#limitations)
- [esbuild: legal comments](https://esbuild.github.io/api/#legal-comments) and
  [esbuild#516 (comments are stripped)](https://github.com/evanw/esbuild/issues/516),
  cited by the Vitest guide for why ignore hints need `-- @preserve`
- [Node.js `inspector` module](https://nodejs.org/api/inspector.html) and
  [Chrome DevTools Protocol `Profiler`](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)
- Local runs on node v24.18.0 / vitest 4.1.11 / vite 7.3.6 / esbuild 0.28.2 /
  pixi 8.20.1, in a sandbox copy of this repo outside the working tree
