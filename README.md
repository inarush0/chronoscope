# Chronoscope

A high-performance, zoomable timeline UI for exploring historical datasets.
Inspired by DAW and map-style navigation — smooth pan, scrub, and semantic
zoom across large temporal datasets to explore scale, sequence, and causality.

## Tech Stack

- **SvelteKit + TypeScript** — app shell and UI
- **PixiJS v8** — WebGL-accelerated canvas rendering
- **d3-scale + d3-time** — tick generation and time math
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

Install dependencies:

```sh
bun install
```

Start the development server:

```sh
bun run dev
```

## Scripts

| Command                           | Description                           |
| --------------------------------- | ------------------------------------- |
| `bun run dev`                     | Start dev server and open in browser  |
| `bun run build`                   | Create production build               |
| `bun run preview`                 | Preview the production build          |
| `bun run check`                   | Type-check with `svelte-check`        |
| `bun run format`                  | Format source files with Prettier     |
| `bun scripts/generate-genesis.ts` | Regenerate the Genesis sample dataset |

## Dataset

The included sample dataset (`src/lib/data/genesis.json`) contains 50 events
from the Book of Genesis using Ussher chronology (~4004–1805 BCE), spanning
the Primeval History, Abraham, Jacob, and Joseph narrative arcs.

To regenerate it:

```sh
bun scripts/generate-genesis.ts
```

## Deployment

To deploy, install an [adapter](https://svelte.dev/docs/kit/adapters) for your
target environment.
