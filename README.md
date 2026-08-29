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

The app reads its dataset from a SQLite file built by the companion
[`chronoscope-infra`](../chronoscope-infra) repository, so build that first:

```sh
cd ../chronoscope-infra && bun install && bun run build-db
```

Then install and run:

```sh
bun install
cp .env.example .env
bun run dev
```

`.env.example` already points `DATABASE_FILE` at
`../chronoscope-infra/data/chronoscope.sqlite`.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `bun run dev`     | Start dev server and open in browser |
| `bun run build`   | Create production build              |
| `bun run preview` | Preview the production build         |
| `bun run check`   | Type-check with `svelte-check`       |
| `bun run format`  | Format source files with Prettier    |

## Dataset

The dataset is a static, read-only SQLite file — there is no database server.
It currently holds **287 events across 6 books** (Genesis, Exodus, Leviticus,
Numbers, Deuteronomy, Joshua) spanning 4004–1375 BC on traditional
(Ussher-style) chronology.

The events themselves are authored as JSON in `chronoscope-infra/data/events/`
and compiled into the SQLite file by `bun run build-db` there — see
`chronoscope-infra/docs/extraction.md` for the authoring format and the shared
chronology. This repository only renders the dataset.

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

| Variable            | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `DATABASE_FILE`     | Path to the built SQLite dataset. Takes precedence over `DATABASE_URL`. |
| `DATABASE_URL`      | HTTPS URL to fetch the dataset from object storage instead.          |
| `DATASET_CACHE_DIR` | Where a fetched dataset is cached. Defaults to `$TMPDIR/chronoscope`. |
| `DATASET_RELOAD`    | Set to `1` to re-open the file when it changes. Local iteration only. |
| `DEFAULT_DATASET`   | Dataset slug when no `?dataset=` is given. Defaults to `bible`.       |
| `ORIGIN`            | Public origin, required by adapter-node behind a proxy.              |

## Deployment

The app builds with `@sveltejs/adapter-node`. The included `Dockerfile`
produces a `node:24-alpine` image that serves the built app on port 3000; see
`chronoscope-infra/compose.yml` for a working configuration.

For a hosted instance, upload the SQLite file to object storage and set
`DATABASE_URL` instead of `DATABASE_FILE`. The app fetches it once on the first
request, caches it on local disk, and opens it read-only — so the deployment is
a single stateless container with no database attached.

## Copyright

Copyright © 2026 Andrew Rush. All rights reserved.
