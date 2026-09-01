# Vitest, and a deliberately narrow test scope

## Context

Chronoscope had no tests. The repo is deliberately low-dependency — one runtime
dependency, `pixi.js` — and it runs the `dataset/` scripts as `.ts` files that
node executes directly by stripping their types, with no build step and no
loader. The obvious move was to keep going: `node --test` strips types the same
way and ships in the runtime already there.

It does not work. Node's type-stripper does no specifier remapping, and every
relative import in `src/` is written the way TypeScript's
`rewriteRelativeImportExtensions` expects — `import { formatYear } from
"./format.js"` for a file on disk called `format.ts`. Under `node --test` that is
`ERR_MODULE_NOT_FOUND` on the first import of the first test. Vite's resolver
handles the specifier as-written, because that is what the app is already built
with.

## Decision

Tests run under **Vitest**, the one dependency this effort added. Tests colocate with what they test — `src/**/*.test.ts`,
`dataset/**/*.test.ts` — and the Go server tests live in `main_test.go` beside
`main.go`.

Three layers are in scope, and they are the three that have a seam a test can
reach without a browser: the **Go server**, the **dataset tooling**, and the
**pure timeline math**. Rendering and DOM behaviour are **out of scope** —
asserting that the canvas draws the right thing, or that the inspector renders.
That is the larger half of a repo whose whole reason to exist is a WebGL render
loop, so the omission is the surprising part and it is deliberate: those tests
need browser automation and a tooling decision of their own. Vitest was chosen
partly because it makes that decision cheap to revisit later, via browser mode,
where `node --test` would have meant starting over.

## Consequences

Nothing type-checks a test at run time. Vitest strips types via esbuild exactly
as node does, so a test can be nonsense to the type system and still run green.
Type safety comes from a separate `tsc` pass over `tsconfig.tests.json`, which
owns **every** test in the repo — the app and dataset configs both exclude
`*.test.ts`, and neither could express what a test needs anyway (the app config
sets `types: []` against a DOM-only lib; the dataset config has no DOM at all).
Two commands where a type-checking runner would have needed one.

`go test` cannot compile without `dist/`. `//go:embed all:dist` is a
compile-time read, so the frontend must be built before the server tests run —
in CI, after `npm run build:binary`, reusing its output.

## What this decision does not cover

**Coverage thresholds.** None is set. A threshold against a nearly-empty suite
either means nothing or blocks the backfill it is meant to encourage; it is a
decision to make after coverage exists, not before.

**Retroactive backfill.** The destination was the ability to write the *next*
feature test-first, not coverage of what was already there. Three exemplar
tests exist, one per layer, and the rest of the repo is untested on purpose
rather than by omission.

---

Decided across
[Map: a test harness that makes TDD the default](https://github.com/inarush0/chronoscope/issues/25),
where the evidence behind each claim above is recorded.
