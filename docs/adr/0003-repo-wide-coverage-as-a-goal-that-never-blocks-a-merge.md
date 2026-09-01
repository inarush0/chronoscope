# Repo-wide coverage, as a goal that never blocks a merge

## Context

[ADR-0002](0002-vitest-and-a-deliberately-narrow-test-scope.md) ended by naming
two decisions it was deliberately not making: **coverage thresholds** ("a
decision to make after coverage exists, not before") and **retroactive
backfill**. This ADR is that later, and it answers both.

It also reopens 0002's largest omission. 0002 put rendering and DOM behaviour
out of scope because "those tests need browser automation and a tooling
decision of their own" — and then chose Vitest partly to keep that decision
cheap to revisit. Revisiting it was forced by arithmetic: under 0002's scope
roughly 420 of ~1220 TypeScript statements were even eligible to be covered, so
the ceiling was about 25% and **80% was unreachable by construction**. A
denominator counting only the layers 0002 blessed would have declared the
largest gap non-existent by moving the goalposts.

What changed the assessment was measuring the barrier rather than assuming it.
It is **construction, not assertion**: `Application.init` reaches for
`document` before any WebGL question arises, and only about **11 of
`TimelineController.ts`'s 722 lines** touch a Pixi layer object at all. The
other ~700 are hit-testing, binning, gap detection and LOD selection — ordinary
logic behind a constructor nothing could call. Once a controller can be built
in a test, its query methods are reachable with no production change; four
throwaway tests took the file from 0% to 48.57%.

## Decision

**The denominator is the whole repo**, and coverage is **reported, never
enforced**.

**Go and TypeScript are two numbers, printed side by side and never blended.** A
healthy Go percentage would otherwise mask a thin TypeScript one, which is
exactly the situation this repo is in.

**80% is a goal the report displays and nothing checks.** There is no
threshold, no ratchet, and no failing check derived from a percentage. The
`coverage` workflow is non-blocking **structurally** — it is on no
required-checks list and carries no job-level `continue-on-error` someone could
flip. (The repo has no branch protection at all today; if that changes, this
job must stay off the required list.) Its two measurement steps do swallow
their own failures, so the summary is written even when the suite is red, and a
final step hands the failure back — a broken suite is still red *and* still
measured.

**Reporting is self-hosted**: a GitHub Actions job summary plus an uploaded
artifact. No Codecov or equivalent — no external account, no CI secret, no
coverage data leaving the repo. Both numbers are written from a *single job*,
because GitHub orders multi-job step summaries by completion time and two jobs
would swap places between runs.

**The render loop is in scope, via Playwright browser mode.** Tests construct a
real `TimelineController` against the production renderer and assert its query
methods — `getEventAt`, `getBinAt`, `getGaps`, `zoomToSelection` — plus
`timelineView.ts` and `inspector/inspector.ts`. **No draw-call spies and no
pixel snapshots.** The point was never to assert that the canvas draws; it was
to reach the logic that decides what to draw.

Measured while deciding this (2026-09-01): **TypeScript 10.42%** (81/777
statements), **Go 70.0%** (35/50). Both are starting lines, recorded so the
climb is legible.

## What the number does not mean

`v8` scores **execution, not assertion**, and on this repo that gap is wide
enough to mislead a reader who trusts the headline.

Constructing a controller and calling `setDataset` executes `renderBackground`,
`renderLODA` and `renderLODB` — **111 statements, 32% of the file** — and every
one is credited as covered by tests that assert only `getEventAt`. Much of how
four tests reached 48.57% is this. Worse, `timelineView.ts` is expected to
report **~95%** while its tooltip positioning is asserted by nothing and
contains a live bug ([#55](https://github.com/inarush0/chronoscope/issues/55)):
the hover tests execute that code on their way to asserting something else. A
near-perfect number over a file with a known bug in it is the sharpest form of
the problem.

The contrast makes the point legible rather than fatal. The ~92 statements of
`dataset/lib/*` are pure functions called directly, so their percentage means
precisely what it appears to mean. **The same repo-wide number is built from
two kinds of statement** — asserted, and merely executed — and a reader
comparing two files at the same percentage is not comparing like with like.

This is not a reason to narrow the scope again, and the reachability arithmetic
above depends on the render statements counting. It is a reason to read the
per-file table rather than the headline, and to treat a high number on a
render-heavy file as an invitation to check what is actually asserted.

## Considered options

**jsdom + node-canvas**, against the Canvas 2D renderer Pixi reintroduced in
8.16.0. Per test it wins (10ms against 23ms), but at the wall clock CI actually
pays the two are within 30ms for one file, because jsdom's 240ms environment
setup eats the difference. With speed a wash, browser mode runs the production
renderer (`type: 1`, WebGL 2) where jsdom would have tested an experimental
`type: 4` path the app never uses.

**`headless-gl` / `@pixi/node`.** Dead on node 24: no ABI-137 prebuild, and a
source build needs C++20 headers. Pixi ships no headless renderer of its own.

**Extracting a seam so the controller need not be constructed at all.** Ruled
out because it is dominated — it requires a production change *and* still
yields no `document`. `create()` works in a test exactly as written, because
Pixi falls back to its canvas renderer without being asked.

**A scoped denominator** — see Context. Rejected as goalpost-moving.

**`istanbul` over `v8`.** The two measure **byte-identical** percentages across
all fifteen files of this repo's real source, so the choice was cost, not
accuracy: `v8` adds 0.15s where `istanbul` adds 0.56s.

## Consequences

**The `include` globs are the whole point.** Vitest's default denominator is
"files a test imported," which here reads **50.31%** over five files. The
repo-wide globs read **10.42%**. Anything that quietly narrows the globs
re-creates the flattering number this ADR exists to reject.

**Browser mode costs 554M of browser binaries**, a `playwright install
--with-deps` step, and an **exact** pin to `vitest@4.1.11` — `@vitest/coverage-v8`
peer-pins that version with no range, so the lockstep was unavoidable via the
provider regardless. Playwright is not wired into CI yet; it lands with the
first controller-test slice.

**`npm run coverage` shows an agent less than it shows CI.** Vitest 4.1 detects
AI agents and silently sets `skipFull`, dropping every fully-covered file from
the table — 24 rows locally against 25 in CI. Also documented in `AGENTS.md`,
because the failure mode is concluding a file is unmeasured when it is
complete.

**`v8`'s branch coverage errs flattering** by 0.26pp here. Small, but it never
errs the other way.

**Excluding `main` from the Go denominator costs a file split.** A Go profile
is per-block by line range with no per-function exclusion, so `server.go` takes
`handler`, `etags` and the embed while `main.go` keeps `main()` alone — which
lets the workflow filter by path instead of hardcoded line numbers.
([#54](https://github.com/inarush0/chronoscope/issues/54), pending.)

**Two exclusions this ADR describes are decided but not yet landed**:
`main.go` ([#54](https://github.com/inarush0/chronoscope/issues/54)) and
`dataset/*.ts` ([#57](https://github.com/inarush0/chronoscope/issues/57)).
Until they do, the measured numbers above stand; after, Go reads ~92% and the
TypeScript denominator drops 777 → 700.

**80% is a ratchet, not a forecast, and the honest model lands just short.**
Modelling realistic per-file targets puts TypeScript at about 78.6%.
`TimelineController.ts` alone is 44.9% of the denominator, and it is neither
optional nor sufficient: with *every other file at 100%* it must still reach
55.6%. The goal is not lowered to meet the model — a goal tuned to be exactly
achievable has stopped being a goal — and nothing fails when the number is 78.

**No seam was extracted for testability.** Every candidate was already
reachable once construction worked, so anything extracted "so it can be tested"
would have been churn for zero test benefit. Three extractions were earned on
the duplication bar `AGENTS.md` already sets — the LOD-A bin tally onto
`BinGrid` (which had already drifted, `?? ""` against `?? "Uncategorized"`), the
gap year label into `format.ts`, and `--events` flag handling written three
times across `dataset/`. The `getEventAt` / `renderLODB` y-band duplication was
looked at and **ruled against**: four lines that agree is not the empty search
`AGENTS.md` asks for. Recorded here so the 722-line controller's shape is not
mistaken for an oversight, and so nobody re-proposes the restructure.

## What this decision does not cover

**`main.ts` (~144 lines) and `main` in `main.go` (12 statements).** App-shell
and process-shell wiring: SVG string constants, toolbar listeners, theme
toggling; flag parsing, `fs.Sub`, `ListenAndServe`. Their bugs are integration
bugs a unit test would not catch, and a test over them would mostly assert that
the code is the code it is. A `run()` seam in `main()` was weighed and rejected
as buying only the percentage — the one bug class hiding there, the embed, is
already reachable through `handler(fs.Sub(distFS, "dist"))`. Excluding `main`
is what lifts Go from 70.0% to ~92%, so the exclusion is named here rather than
left for a reader to infer the entrypoint is tested.

**The three `dataset/*.ts` entrypoint scripts (77 statements).** The third
member of that family, but excluded with a positive claim rather than a shrug:
`dataset.yml` runs `validate` and `check:artifact` on every push against the
real 1181 events, and `check-artifact.ts` verifies `build.ts`'s logic by proxy.
These are tested by a mechanism `v8` cannot see. Covering them *in situ* is not
an option — a top-level module body calling `process.exit` kills the runner on
import — so it would require a `main(argv)` extraction, which buys 4 of the 22
points that excluding them buys. `dataset/lib/` stays measured, and is where
the remaining 151 statements live.

**Pixel-snapshot and visual-regression testing.** The highest-maintenance,
flakiest option, over a canvas rendering 1181 events across 4000 years. Ruled
out on scope, not deferred.

**Draw-call assertions.** Deferred rather than ruled out, and now half
justified: construction is cheap and browser mode runs the real renderer, so
such an assertion would at least be against the production path. It is still
unknown whether query-method tests miss real render regressions, because they
do not exist yet. Reopen on that evidence, not before — the cost is welding the
suite to Pixi's drawing API.

**A coverage ratchet floor** — "may not drop below where it is," distinct from
the 80% goal. Deliberately undecided: it is a merge gate wearing a different
hat, and it fails PRs for opaque reasons, since deleting a well-tested file
lowers the percentage. Revisit only once the number has stabilised.

**Making coverage block a merge**, in any form, including the 80% goal itself.

---

Decided across
[Map: coverage reporting and a backfill to 80%](https://github.com/inarush0/chronoscope/issues/38),
where the measurements and reasoning behind each claim above are recorded.
