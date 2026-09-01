# Chronoscope

A high-performance, zoomable timeline UI for exploring historical datasets.
Inspired by DAW and map-style navigation — smooth pan, scrub, and semantic
zoom across large temporal datasets to explore scale, sequence, and causality.

## Tech Stack

- **Vanilla TypeScript + Vite** — app shell and UI; no framework
- **Go** — a single binary that serves the embedded frontend and dataset
- **PixiJS v8** — WebGL-accelerated canvas rendering
- **npm + node 24** — package manager and dev tooling; the dataset build scripts
  are `.ts` files node runs directly by stripping their types
- **Vitest + `go test`** — the test harness, over the three layers that have a
  seam a test can reach

Why a Go binary serves a TypeScript app, and why there is no server tier:
[ADR-0001](docs/adr/0001-static-frontend-embedded-in-a-go-binary.md). Why
Vitest, and why the renderer is deliberately untested:
[ADR-0002](docs/adr/0002-vitest-and-a-deliberately-narrow-test-scope.md).

## Features

- Cursor-anchored zoom and drift-free pan
- Automatic LOD switching:
  - **LOD A** (zoomed out): density-bin histogram colored by dominant category
  - **LOD B** (zoomed in): individual events — interval bars and instant dot markers
- Hover tooltips for both events and density bins
- Gap indicators showing elapsed time between consecutive events (LOD B)
- Double-click a density bin to zoom into its event range
- Click events to select; **Zoom to Selection** snaps the view to the selected event or bin
- Event inspector panel: title, date range, category, description, and scripture references (via BibleGateway)
- Light/dark theme with system preference detection

## Getting Started

```sh
npm install
npm run dev
```

The dataset is committed at `static/chronoscope.json`, so there is nothing to
build or configure first.

Node 24 or newer is required and enforced at install time: the dataset scripts
under `dataset/` are TypeScript that node executes directly, without a build
step or a loader. Go 1.27+ is needed only to build the binary.

## Deploying

Chronoscope ships as **one file**. `main.go` embeds the built frontend and the
dataset with `//go:embed`, so the binary is the whole deployment — nothing sits
beside it, and there is nothing to configure:

```sh
npm run build:binary          # -> ./chronoscope, for this machine
npm run build:linux           # -> ./chronoscope-linux-amd64, the server target
./chronoscope -addr :8080     # -addr is the only flag
```

Both scripts build the frontend first: `//go:embed dist` reads `dist/`, which is
gitignored, so `go build` on its own fails to compile in a fresh clone. Run them
rather than bare `go build`.

The server does no routing, reads no environment and opens no files at runtime.
It sets one cache policy per URL class: everything under `/assets/` is
content-hashed by Vite and cached immutably for a year, while `index.html`,
`robots.txt` and `chronoscope.json` ship under stable URLs and so must
revalidate. Those three carry a SHA-256 `ETag` computed at startup, which
makes revalidation a 304 — without one, embedded files have a zero modification
time and every reload would re-download the 531 KB dataset in full.

## Scripts

| Command                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start dev server and open in browser                |
| `npm run build`        | Create production build                             |
| `npm run build:binary` | Build the frontend, then the Go binary that serves it |
| `npm run build:linux`  | The same, cross-compiled for `linux/amd64`          |
| `npm run preview`      | Preview the production build                        |
| `npm run check`        | Type-check the app with `tsc`                       |
| `npm run check:dataset`| Type-check the dataset build tooling                |
| `npm run test`         | Run the Vitest suite — it never type-checks         |
| `npm run check:tests`  | Type-check every test in the repo                   |
| `npm run format`       | Format source files with Prettier                   |
| `npm run format:check` | Check that formatting is clean, without writing     |
| `npm run validate`     | Check the authored event files without building     |
| `npm run build-db`     | Rebuild `static/chronoscope.json` from `events/`    |
| `npm run check:artifact`| Fail if the committed dataset has drifted from `events/` |

## Dataset

The dataset is a static, read-only JSON file fetched by the browser — there is
no database and no server. It currently holds **1181 events across 26 books**,
spanning 4004 BC to 62 AD on traditional (Ussher-style) chronology.

Authoring lives under `dataset/`; the build artifact lands in `static/`:

| Path                        | Role                                             |
| --------------------------- | ------------------------------------------------ |
| `dataset/events/*.json`     | Authored events, one file per book. **Source of truth.** |
| `dataset/books.json`        | Coverage manifest — which books are in scope     |
| `static/chronoscope.json`   | Committed build artifact, fetched by the app     |
| `dataset/build.ts`          | Compiles the event files into the JSON artifact  |
| `dataset/validate.ts`       | Schema, dates, duplicate ids, coverage           |

The artifact is committed rather than built on demand, so a fresh clone runs with
no build step. CI rebuilds on every PR and fails if the committed file has
drifted from the event files. The authoring loop is:

```sh
npm run validate        # schema, dates, duplicate ids, coverage
npm run build-db        # regenerate the dataset, then commit it
npm run check:artifact  # what CI runs: is the committed file current?
```

The dev server serves `static/` directly, so a rebuild shows up on refresh
without a restart.

Authored dates are human-readable (`"1446-04-15 BC"`, `"57 AD"`) and converted to
epoch milliseconds at build time, so nobody hand-computes offsets. See
[`docs/extraction.md`](docs/extraction.md) for the authoring format, the id and
category conventions, and the shared chronology.

### Scripture text and copyright

The NRSV/NRSVUE translation is under copyright, so **no verse text is stored in
the dataset or rendered by the app**. Events carry a title, a short description
written for the timeline, and a canonical reference such as `Genesis 3:1-24`.

Passage text reaches the reader through BibleGateway's [Reference Tagging
Tool](https://www.biblegateway.com/share/tooltips/), loaded in `index.html`:
it converts each plain-text reference into a link whose hover pop-over is served
by BibleGateway, under their license rather than ours. `src/inspector/inspector.ts`
re-runs `BGLinks.linkVerses()` after each selection change so newly rendered
references get tagged.

This is why references must stay in a parseable canonical form, and why
inlining scripture — into the event JSON, the inspector, or anywhere else — is
not an option.

## Configuration

None. The app is fully static and reads no environment variables; the one
dataset is served as a file and fetched by the browser.

## Copyright

Copyright © 2026 Andrew Rush. All rights reserved.
