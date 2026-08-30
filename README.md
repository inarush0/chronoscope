# Chronoscope

A high-performance, zoomable timeline UI for exploring historical datasets.
Inspired by DAW and map-style navigation — smooth pan, scrub, and semantic
zoom across large temporal datasets to explore scale, sequence, and causality.

## Tech Stack

- **SvelteKit + TypeScript** — app shell and UI
- **PixiJS v8** — WebGL-accelerated canvas rendering
- **d3-scale + d3-time** — tick generation and time math
- **node:sqlite** — reads the dataset; a Node 24 builtin, so there are no
  runtime dependencies beyond the rendering libraries
- **bun** — package manager and dev tooling

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
bun install
cp .env.example .env
bun run dev
```

The dataset is committed at `dataset/chronoscope.sqlite`, so there is nothing to
build or configure first.

## Scripts

| Command                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `bun run dev`          | Start dev server and open in browser                |
| `bun run build`        | Create production build                             |
| `bun run preview`      | Preview the production build                        |
| `bun run check`        | Type-check the app with `svelte-check`              |
| `bun run check:dataset`| Type-check the dataset build tooling                |
| `bun run format`       | Format source files with Prettier                   |
| `bun run validate`     | Check the authored event files without building     |
| `bun run build-db`     | Rebuild `dataset/chronoscope.sqlite` from `events/` |

## Dataset

The dataset is a static, read-only SQLite file — there is no database server.
It currently holds **1181 events across 26 books**, spanning 4004 BC to 62 AD on
traditional (Ussher-style) chronology.

Everything about it lives under `dataset/`:

| Path                        | Role                                             |
| --------------------------- | ------------------------------------------------ |
| `dataset/events/*.json`     | Authored events, one file per book. **Source of truth.** |
| `dataset/books.json`        | Coverage manifest — which books are in scope     |
| `dataset/chronoscope.sqlite`| Committed build artifact, opened by the app      |
| `dataset/build.ts`          | Compiles the event files into the SQLite dataset |
| `dataset/validate.ts`       | Schema, dates, duplicate ids, coverage           |

The artifact is committed rather than built on demand, so a fresh clone runs with
no build step. The build is deterministic, and CI rebuilds on every PR and fails
if the committed file drifts from the event files. The authoring loop is:

```sh
bun run validate     # schema, dates, duplicate ids, coverage
bun run build-db     # regenerate the dataset, then commit it
```

With `DATASET_RELOAD=1` the running dev server re-opens the database when the
file changes, so a rebuild shows up on refresh without a restart.

Authored dates are human-readable (`"1446-04-15 BC"`, `"57 AD"`) and converted to
epoch milliseconds at build time, so nobody hand-computes offsets. See
[`docs/extraction.md`](docs/extraction.md) for the authoring format, the id and
category conventions, and the shared chronology.

### Scripture text and copyright

The NRSV/NRSVUE translation is under copyright, so **no verse text is stored in
the dataset or rendered by the app**. Events carry a title, a short description
written for the timeline, and a canonical reference such as `Genesis 3:1-24`.

Passage text reaches the reader through BibleGateway's [Reference Tagging
Tool](https://www.biblegateway.com/share/tooltips/), loaded in `src/app.html`:
it converts each plain-text reference into a link whose hover pop-over is served
by BibleGateway, under their license rather than ours. `Inspector.svelte`
re-runs `BGLinks.linkVerses()` after the DOM updates so newly rendered
references get tagged.

This is why references must stay in a parseable canonical form, and why
inlining scripture — into the event JSON, the inspector, or anywhere else — is
not an option.

## Configuration

| Variable          | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `DATASET_RELOAD`  | Set to `1` to re-open the dataset when it changes. Local iteration only. |
| `DEFAULT_DATASET` | Dataset slug when no `?dataset=` is given. Defaults to `bible`.       |

## Copyright

Copyright © 2026 Andrew Rush. All rights reserved.
