# Static frontend served by an embedded Go binary

## Context

Chronoscope was built as a SvelteKit app reading a committed SQLite file. The
entire server tier was two files — `src/lib/server/db.ts` and
`src/routes/+page.server.ts` — running two `SELECT`s once, at page load, to hand
the browser a list of books and a list of events. Nothing else ever touched the
server.

Everything the app actually does happens after that: cursor-anchored zoom,
drift-free pan, LOD switching, hit-testing and tooltips are a client-side WebGL
`requestAnimationFrame` loop inside `TimelineController`, which was already
framework-free and never imported Svelte. So the meta-framework, the Node
runtime and the runtime database existed to deliver one payload that could just
as well be a file on disk.

## Decision

There is no server tier. `dataset/build.ts` precomputes the payload as
`static/chronoscope.json` (531 KB, 140 KB gzipped) instead of a SQLite database,
and the browser `fetch`es it as an ordinary asset. The frontend is vanilla
TypeScript on Vite, with `pixi.js` as its only runtime dependency. A 111-line
stdlib-only Go program `//go:embed`s the built `dist/` tree and serves it, so a
deployment is **one cross-compiled file**: nothing sits beside the binary, it
opens no files and reads no environment.

The dataset is embedded as a separate asset rather than inlined into the JS
bundle, so editing events doesn't force a frontend rebuild and startup doesn't
parse 531 KB as a JavaScript object literal.

## Considered options

**HTMX.** Ruled out immediately: it presumes a server to round-trip to, and
there isn't one. Pan and zoom are per-frame WebGL work, not requests.

**`bun build --compile`.** Verified working end to end — a 62 MB binary with the
dataset embedded via `Database.deserialize`, which was necessary because
`node:sqlite` cannot open Bun's `/$bunfs/` paths. Rejected anyway: once the app
is static there is no server left to compile, the artifact is roughly 6× the
9.4 MB Go binary, and its Linux cross-compile story was unverified where Go's is
a single `GOOS`/`GOARCH` pair. Recording this because it _worked_, and "why not
just compile the JS runtime?" is the obvious question to ask again later.

**A server-rendered timeline, or porting the renderer to Go + WASM.** Both
would have discarded the sustained-60fps behaviour that is the reason the
project exists. The renderer is the product; the delivery mechanism is not.

## What this decision does not cover

`TimelineController` and PixiJS survived the migration **unchanged** — the port
moved the shell around a frozen renderer, and parity was verified against the
old build rather than reasoned about. Amid a rewrite of everything else, leaving
the largest file untouched is the part a reader is most likely to assume was an
oversight. It wasn't.

The migration also **deleted** the tick-generation code (`getTicks`,
`formatTickLabel`, `TickMark`), taking the last d3 dependency with it. That code
was dead: the app has never drawn a time axis and nothing consumed those
functions. Rendering one is a real gap and a worthwhile future effort, but it is
a new feature rather than part of this decision.

---

Decided across
[Map: Chronoscope as a single Go binary with a vanilla-TS frontend](https://github.com/inarush0/chronoscope/issues/10),
where the measurements and parity evidence behind each claim above are recorded.
