# Chronoscope

## Toolchain

**npm and node 24. Never `bun` — it is gone from this repo.** The dataset build
scripts under `dataset/` are `.ts` files node runs directly by stripping their
types, so they must stay within erasable syntax: no enums, no namespaces, no
parameter properties. `dataset/tsconfig.json` sets `erasableSyntaxOnly` to
enforce that; `npm run check:dataset` is what catches a violation.

The frontend is vanilla TypeScript on Vite — no framework, no Svelte. There is
no server tier: `main.go` embeds the built `dist/` and serves it. Run
`npm run build:binary` rather than bare `go build`, because `//go:embed dist`
needs the frontend built first and `dist/` is gitignored.

The script table lives in `README.md`; don't duplicate it here.

## Testing

**New behaviour arrives test-first.** The loop, in order:

1. **Find the seam that is already there** before building one. `handler`
   already took an `fs.FS`; `resolveBook` was already pure over an in-memory
   `BookFile`. Only the timeline needed a seam extracted, and it turned out to
   be a value object hiding inside mutable state (`Viewport`). Extract when the
   search comes up empty, not before.
2. **Watch the test go red.** Break the code it covers, confirm the failure,
   put it back. A test that has never failed is not yet evidence: all three
   exemplar tests passed on the first run, and two of them passed for the wrong
   reason — found only this way.
3. **Assert the consequence, not just the complaint.** `resolveBook`'s
   invariant is that a rejected event yields an error *and no resolved row*.
   Asserting the error alone is the version that misses the bug.

Tests colocate with what they test: `src/**/*.test.ts`, `dataset/**/*.test.ts`,
and `main_test.go` beside `main.go`.

Two facts the commands hide:

- **Vitest never type-checks.** `npm run test` strips types via esbuild, so a
  test can be nonsense to the type system and still run green.
  `npm run check:tests` is the only thing that type-checks tests, and it owns
  every test in the repo — the app and dataset configs both exclude
  `*.test.ts`.
- **`go test` needs `dist/`.** `//go:embed all:dist` is a compile-time read, so
  the frontend must be built first; run `npm run build:binary`, then
  `go test ./...`.
- **`npm run coverage` shows you less than it shows CI.** Vitest 4.1 detects AI
  agents (`CLAUDECODE` / `CLAUDE_CODE` / `AI_AGENT`) and silently sets
  `skipFull`, dropping every fully-covered file from the table. Don't conclude a
  file is unmeasured because it is missing; clear those variables to reproduce
  the CI table. The `coverage` workflow reports Go and TypeScript as two
  numbers and enforces neither.

Which layers are tested, which deliberately are not, and what the coverage
number does and does not mean:
[ADR-0003](docs/adr/0003-repo-wide-coverage-as-a-goal-that-never-blocks-a-merge.md).
Why the runner is Vitest:
[ADR-0002](docs/adr/0002-vitest-and-a-deliberately-narrow-test-scope.md), which
0003 supersedes.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `inarush0/chronoscope`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
