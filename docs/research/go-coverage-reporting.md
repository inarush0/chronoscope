# How Go coverage is produced and surfaced

Research for [#41](https://github.com/inarush0/chronoscope/issues/41), a sub-issue
of the map [#38](https://github.com/inarush0/chronoscope/issues/38). This ticket
**decides**; [#45](https://github.com/inarush0/chronoscope/issues/45) builds the
job. Nothing here relitigates the map's locked decisions: reporting is
self-hosted (job summary + artifact, no Codecov/Coveralls), Go and TypeScript
are two numbers never blended, and coverage never gates a merge.

Toolchain measured against: `go.mod` says `go 1.27`; the local toolchain is
`go1.27.0 darwin/arm64`. Every "measured" figure below was produced by running
the command on this repo at `6b8045d`, after `npm run build:binary`.

## The measured baseline

```
$ npm run build:binary
$ go test -coverprofile=/tmp/cover.out ./...
ok  	github.com/inarush0/chronoscope	0.194s	coverage: 70.0% of statements

$ go tool cover -func=/tmp/cover.out
github.com/inarush0/chronoscope/main.go:40:	main		0.0%
github.com/inarush0/chronoscope/main.go:59:	handler		100.0%
github.com/inarush0/chronoscope/main.go:86:	etags		85.7%
total:						(statements)	70.0%
```

**Go coverage today is 70.0% of statements.** The shape of that number matters
more than the number: there are only three functions. `handler` — the thing
`main_test.go` was written for — is at 100%. `etags` is at 85.7%, missing only
its error branches. The entire gap to 80% is `main` at 0.0%: flag parsing,
`fs.Sub`, `http.ListenAndServe`, and two `log.Fatalf` calls that cannot be
exercised without either a seam or a subprocess.

That is a useful thing for the map to know now: **the Go half of the 80% goal is
~10 points away and the whole deficit is one untestable function.** Whoever
picks up the Go backfill is choosing between extracting a `run(args, addr)` seam
out of `main` and accepting Go at 70%.

## Decision 1: the invocation

```
go test -coverprofile=cover.out ./...
```

- `-coverprofile` "Write a coverage profile to the file after all tests have
  passed. Sets -cover." (`go help testflag`, go1.27). Because it sets `-cover`,
  no separate `-cover` flag is needed.
- **The doc's "after all tests have passed" is stale.** Measured on go1.27 with
  a deliberately failing test in a scratch module: `go test` exited 1, printed
  `FAIL`, and **still wrote a complete profile** (`Used 100.0%`, `Unused 0.0%`,
  `total 50.0%`). So the reporting steps in #45 should carry `if: always()` and
  will get a real profile even on a red test run. Do not design around the
  documented wording.
- `-covermode` defaults to `set` (bool: did this statement run) unless `-race`
  is on, in which case `atomic` (`go help testflag`). Measured: forcing
  `-covermode=atomic` changes the profile header from `mode: set` to
  `mode: atomic` and leaves the total at 70.0%. **Leave the default.** `set` is
  correct for a "what fraction of statements is covered" report; `count`/`atomic`
  buy hit counts nobody is reporting, and `atomic` costs performance.

### Where the profile lands

Write it to a path outside the tree, or add one to `.gitignore`. `.gitignore`
currently covers `/dist/` and the two binaries but has no coverage entry, so a
profile written to the repo root would show up as an untracked file in any local
run. Recommendation for #45: write to the runner's `$RUNNER_TEMP` (or just
`/tmp/`) in CI, and if a local convenience script is ever added, have it write
to `/tmp` too rather than growing a `.gitignore` line.

## Decision 2: `-coverpkg` is not needed

**No.** Measured directly:

```
$ go test -coverpkg=./... -coverprofile=/tmp/cover2.out ./...
ok  	github.com/inarush0/chronoscope	0.201s	coverage: 70.0% of statements in ./...
```

Identical 70.0%, identical per-function breakdown. The only difference is the
cosmetic `in ./...` suffix on the stdout line.

This is what the docs predict: `-coverpkg` applies "coverage analysis in each
test to packages whose import paths match the patterns. The default is for each
test to analyze only the package being tested." (`go help testflag`). This
module is a single `package main` at the root with its test beside it, so "the
package being tested" and `./...` are the same set. `-coverpkg` earns its keep
when package A's tests exercise package B and you want B's lines counted; there
is no package B here.

**Revisit only if** the Go side ever grows a second package (say `internal/`
something). At that point `-coverpkg=./...` becomes load-bearing, because
otherwise a package with no `_test.go` file of its own is simply absent from the
profile rather than counted as 0%.

## Decision 3: `go tool cover -func` is the right thing for the summary

`go tool cover` offers exactly two report modes (`go tool cover` usage, go1.27):
`-func=c.out` (per-function percentages to stdout) and `-html=c.out [-o f.html]`
(annotated source as HTML). Both accept `-o`. There is no built-in Markdown,
JSON, or LCOV output — anything else means a third-party converter, which the
map's self-hosted decision argues against on the same grounds as Codecov.

So the realistic menu is: the raw `-func` text, the `-func` text reshaped into
Markdown, or the `-html` file.

**Recommendation: put a one-line headline plus a small Markdown table in the job
summary, and upload the HTML as the artifact.**

The headline number is what makes decision 2 of the map ("two numbers, side by
side") legible — a reader should see `Go 70.0%` and `TypeScript NN%` without
parsing a table. The table is affordable here precisely because the package is
tiny: three rows today. Prototyped against the real profile:

```
### Go coverage: 70.0%

| Function | File:line | Coverage |
| --- | --- | ---: |
| `main` | `main.go:40` | 0.0% |
| `handler` | `main.go:59` | 100.0% |
| `etags` | `main.go:86` | 85.7% |
```

Extraction of the headline is a one-liner and was verified to print `70.0%`:

```sh
go tool cover -func=cover.out | awk '/^total:/{print $NF}'
```

Notes on the `-func` format, from reading the real output rather than docs:

- Columns are tab-separated but *padded with runs of tabs*, so split on `\t+`,
  not a single `\t`. Field 1 is `<import path>/<file>:<line>:`, field 2 the
  function name, field 3 the percentage.
- The last line is `total:` + tabs + `(statements)` + tab + the percentage, so
  it has a different field count from the body rows. Filter it with `/^total:/`
  rather than by position.
- The file column carries the **full module import path**
  (`github.com/inarush0/chronoscope/main.go`), which is noise in a summary
  rendered inside that very repo. Strip the module prefix.

Rejected alternatives:

- **Raw `-func` output in a fenced code block.** Cheapest possible step, and
  honest. Rejected only because it reads as terminal spew next to whatever
  shape the Vitest number takes, and the map explicitly wants the two numbers
  legible side by side. Worth keeping as the fallback if the awk in #45 turns
  out to be fussier than it looks — the information content is identical.
- **HTML in the job summary.** Not possible: job summaries render GitHub
  flavored Markdown, and GitHub sanitizes embedded scripts/styles.
- **A per-file rollup.** Meaningless at one file.

### Scale check

Job summaries are "restricted to a maximum size of 1MiB" **per step**, and
summaries are isolated between steps "so that potentially malformed Markdown
from a single step cannot break Markdown rendering for subsequent steps"
(GitHub Actions workflow-commands reference). A three-row table is nowhere near
that. Even a Go side ten times this size would not approach it.

### The artifact

`go tool cover -html=cover.out -o coverage.html` produces a **single
self-contained file** — measured at 7,155 bytes for this profile, with the
annotated source and its viewer inlined. That is the right artifact payload:
one file, no assets directory, opens offline after download.

Upload it with `actions/upload-artifact`. Current major is **v7** (`v7.0.1`,
released 2026-04-10). The repo currently pins `checkout@v4`, `setup-node@v4`,
`setup-go@v5`, so #45 should pin `upload-artifact@v7` rather than copying a v4
snippet off the internet. Relevant behaviours from the action's README:

- **Artifacts from v4 onward are immutable**, and "uploading to the same
  artifact via multiple jobs is _not_ supported with v4." Irrelevant if
  coverage lives in one job (see below); it becomes a real constraint if Go and
  TS ever upload under the same artifact name from different jobs. Another
  reason to keep them in one job.
- `retention-days` defaults to the repository setting (max 90).
- `if-no-files-found` defaults to `warn`. Set it to `error`: a missing
  `coverage.html` means the report silently didn't happen, which is exactly the
  failure a warning would hide.
- v7 added an `archive: false` mode that uploads a single file unzipped. Tempting
  for a lone `coverage.html`, but with `archive: false` the `name` input is
  ignored and the artifact takes the file's own name. Fine either way; #45's call.

Note for expectations: a zipped HTML artifact cannot be viewed inline on
github.com — it downloads. The summary is the at-a-glance surface; the artifact
is for the person who wants to see *which* lines.

## Decision 4: the job rebuilds the frontend; it does not reuse

`//go:embed all:dist` is a compile-time read, so `go test` cannot build without
`dist/`, which is gitignored. build.yml already handles this in the gating job
and says so in a comment ("Builds the frontend first on purpose").

Options considered:

1. **Rebuild in the coverage job** (`npm ci` + a Vite build). Self-contained;
   the job can be read top to bottom and has no cross-job coupling.
2. **Reuse via artifact.** Have the build job upload `dist/` and the coverage
   job `needs:` it and download. Costs a `needs:` edge — which serialises
   coverage behind the gating job and makes a build failure also *skip* coverage
   — plus an upload and a download, to avoid a Vite build **measured at 1.00s**
   (727 modules). The transfer would cost more than the thing it saves.
3. **Stub `dist/`.** `mkdir -p dist && touch dist/index.html` satisfies the
   embed, and no test reads `distFS` — `main_test.go` builds its own
   `fstest.MapFS`. This would let the coverage job skip Node entirely.
   **Rejected:** it makes the coverage job compile a binary that is not the
   product, and the day someone writes a test that does touch `distFS` it fails
   in a way that reads as a Go problem rather than a CI-fixture problem. Cheap
   now, confusing later.

**Recommendation: option 1, rebuild — but with `npm run build`, not
`npm run build:binary`.** The ticket text assumes `build:binary`; that script is
`npm run build && go build -o chronoscope .`, and the coverage job has no use
for the compiled binary. `go test` needs `dist/` to exist, nothing more. Dropping
the `go build` saves a link step and removes a second place where a Go
compile error would surface.

The npm install is the real cost, not the Vite build. `actions/setup-node@v4`
with `cache: npm` is already used in build.yml and applies unchanged.

## Decision 5: one job, and why it structurally cannot gate

**Put Go and TypeScript coverage in the same job**, in a new
`.github/workflows/coverage.yml`, separate from `build.yml`.

The one-job part is not a style preference; it follows from the summary
semantics. Per the GitHub Actions reference: "When a job finishes, the summaries
for all steps in a job are grouped together into a single job summary... **If
multiple jobs generate summaries, the job summaries are ordered by job
completion time.**" Two jobs therefore produce a summary whose *order is a race*
— Go on top on one run, TypeScript on top on the next. The map's "reported side
by side" is only stable inside a single job, where step order is deterministic.
Steps append with `>>` to `$GITHUB_STEP_SUMMARY`, which "is unique for each step
in a job", and a newline is added per append.

The separate-workflow part keeps the map's decision 8 visible: `build.yml` is
the file whose job is *supposed* to fail a PR; `coverage.yml` is the file whose
job reports. Someone reading either file can tell which is which without
knowing the branch settings.

**On "never gates a merge":** verified against the live repo —
`GET /repos/inarush0/chronoscope/rulesets` returns `[]` and
`GET /repos/inarush0/chronoscope/branches/main/protection` returns
`404 Branch not protected`. There is **no branch protection at all** right now,
so nothing gates any merge today. Per GitHub's protected-branches docs,
"Required status checks must have a `successful`, `skipped`, or `neutral` status
before collaborators can make changes to a protected branch" — only checks
explicitly designated as required create a merge barrier.

The structural consequence, and the thing #45 should record in a comment: the
coverage job is non-gating **because it is a distinct job name that is not on
any required-checks list**, and if protection is ever turned on, the coverage
job must not be added to it. It should *not* be made non-gating with
`continue-on-error`, and it must not grow a threshold flag. A red coverage job
(because `go test` failed) is legitimate signal; it just isn't a gate. And there
is no `-coverprofile` threshold flag in Go anyway — failing on a percentage
would require hand-written comparison logic, i.e. exactly the "flag someone can
flip" the map rules out.

## Recommended shape for #45 (Go half only)

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 24, cache: npm }
- uses: actions/setup-go@v5
  with: { go-version-file: go.mod, cache: false }   # no go.sum to key on
- run: npm ci
- run: npm run build                                # //go:embed all:dist
- run: go test -coverprofile="$RUNNER_TEMP/go-cover.out" ./...
- if: always()
  run: |                                            # headline + table
    ...  go tool cover -func="$RUNNER_TEMP/go-cover.out" ... >> "$GITHUB_STEP_SUMMARY"
- if: always()
  run: go tool cover -html=... -o "$RUNNER_TEMP/go-coverage.html"
- uses: actions/upload-artifact@v7
  if: always()
  with:
    name: go-coverage
    path: ${{ runner.temp }}/go-coverage.html
    if-no-files-found: error
```

`cache: false` on `setup-go` is copied deliberately: build.yml explains that
there is no `go.sum` to key a cache on and setup-go warns when it globs for one
and finds nothing. The same reasoning applies verbatim in the coverage job.

## Sources

Primary only; every Go claim was also executed locally against go1.27.0.

- `go help testflag` (go1.27.0, local) — `-cover`, `-covermode`, `-coverpkg`,
  `-coverprofile`. Mirrored at
  <https://pkg.go.dev/cmd/go#hdr-Testing_flags>.
- `go tool cover` usage output (go1.27.0, local) — the `-func` / `-html` / `-o`
  surface. Mirrored at <https://pkg.go.dev/cmd/cover>.
- <https://go.dev/doc/build-cover> — "For unit tests, collecting a coverage
  profile and generating a report requires two steps: a `go test
  -coverprofile=...` run, followed by an invocation of `go tool cover
  {-func,-html}`." Confirms the two-step unit-test path is the right one and
  that `go build -cover` + `go tool covdata` is the *integration*-test path
  (Go 1.20+), not applicable here.
- <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands>
  — `$GITHUB_STEP_SUMMARY`: GitHub flavored Markdown, unique per step, `>>` to
  append, 1MiB per-step cap, isolation between steps, cross-job summaries
  ordered by completion time.
- <https://docs.github.com/en/actions/reference/limits> — Actions limits.
- <https://github.com/actions/upload-artifact> README and the repo's release
  list via `gh api repos/actions/upload-artifact/releases` — current major v7
  (`v7.0.1`, 2026-04-10), v4+ immutability, `if-no-files-found`,
  `retention-days`, v7 `archive: false`.
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
  — required status checks and merge blocking.
- `gh api repos/inarush0/chronoscope/rulesets` and
  `.../branches/main/protection` — current (absent) protection state.
