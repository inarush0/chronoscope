/**
 * Shared scaffolding for the browser-mode tests that construct a real
 * `TimelineController`. Imported by the `src/timeline` and `src/inspector`
 * slices of the coverage backfill (#52); excluded from coverage in
 * `vitest.config.ts`.
 *
 * Two things make the assertions in those tests constructible rather than
 * lucky, and both live here so no slice has to rediscover them:
 *
 * 1. `TimelineController.create()` sizes Pixi from `canvas.clientWidth` /
 *    `clientHeight`. `main.css` is never loaded in a test, so a bare canvas
 *    lays out at its 300x150 attribute default — or at zero inside a
 *    display:none parent. `mountCanvas` sets inline dimensions instead of
 *    relying on a stylesheet.
 * 2. The view is rigged to exactly one day per pixel, so every expected
 *    coordinate below is arithmetic a reader can check in their head rather
 *    than a number copied out of a passing run.
 *
 * The zero-width trap is worth naming, because it produces a suite that is
 * green and worthless: at width 0 the controller's `pxPerEvent` is 0, LOD
 * flips to "A", and `getEventAt` returns null unconditionally. A test that
 * only asserts misses passes on a controller that cannot hit-test at all.
 * Assert hits, and assert `lod` is "B" wherever the test assumes it.
 */
import { TimelineController } from "../timeline/TimelineController.js";
import type { TimelineEvent } from "../timeline/types.js";

export const DAY = 86_400_000;

export const WIDTH = 800;
export const HEIGHT = 300;

/** 800 days across 800 px — one day per pixel, so time in days *is* x. */
export const VIEW_START = 0;
export const VIEW_END = 800 * DAY;

// ─── Geometry ────────────────────────────────────────────────────────────────

/**
 * `TimelineController` derives these from private constants in two places —
 * `renderLODB` draws with them and `getEventAt` hit-tests against them — and
 * #43 ruled against extracting the derivation into something shared. So it is
 * restated here a third time, from the layout constants rather than from
 * either copy, and the tests are what hold all three in agreement: a change to
 * one that the others do not follow lands as a failure here.
 */
export const SPINE_Y = HEIGHT * (2 / 3); // 200 — the spine line
export const DOT_Y = SPINE_Y - 18; // 182 — centre of an instant's dot
export const BAR_BOT_Y = SPINE_Y - 34; // 166 — bottom edge of an interval bar
export const BAR_TOP_Y = BAR_BOT_Y - 8; // 158 — top edge of an interval bar
/** Half-width of the hit target `getEventAt` allows around drawn geometry. */
export const HIT = 8;

/** A y inside the interval bar's band and outside every instant's. */
export const BAR_Y = (BAR_TOP_Y + BAR_BOT_Y) / 2; // 162

/** Where `getGaps` puts its connector line: below the spine, not on it. */
export const GAP_Y = SPINE_Y + 20; // 220

// ─── Dataset ─────────────────────────────────────────────────────────────────

/**
 * Five events, laid out so that x in pixels equals the start day. Small enough
 * to keep `pxPerEvent` (800/5 = 160) well above the LOD threshold of 40, so
 * the controller stays in LOD B.
 */
export const events: TimelineEvent[] = [
  /** Instant, alone at x = 100. */
  { id: "instant-a", start: 100 * DAY, title: "Instant A", category: "Reign" },
  /** Instant at x = 400, with `instant-e` 2 px to its right. */
  { id: "instant-b", start: 400 * DAY, title: "Instant B", category: "Reign" },
  /** Instant at x = 402, close enough to `instant-b` to share hit targets. */
  { id: "instant-e", start: 402 * DAY, title: "Instant E", category: "Reign" },
  /** Interval spanning x = 600..700. */
  {
    id: "interval-c",
    start: 600 * DAY,
    end: 700 * DAY,
    title: "Interval C",
    category: "Exile",
  },
  /** Instant at x = 650, deliberately on top of `interval-c`. */
  { id: "instant-d", start: 650 * DAY, title: "Instant D", category: "Reign" },
];

// ─── Construction ────────────────────────────────────────────────────────────

/**
 * A canvas laid out at the fixture's dimensions, appended to the document so
 * it actually gets a box.
 */
function mountCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  document.body.appendChild(canvas);
  return canvas;
}

export interface FixtureOptions {
  /** Dataset to load instead of the five-event fixture above. */
  events?: TimelineEvent[];
  onSelectionChange?: (id: string | null) => void;
}

/**
 * A real controller over a real canvas, with the fixture dataset loaded and
 * the view rigged to one day per pixel. No production code is mocked or
 * subclassed: `create()` runs as written, Pixi picks a renderer, and the
 * caller hit-tests through the public surface.
 *
 * The overrides exist for tests whose subject is not the geometry: a gap or an
 * LOD flip needs a dataset shaped for it, and a selection needs a callback to
 * observe. The view and the canvas stay as they are either way, so an
 * overridden dataset is still laid out at one day per pixel.
 */
export async function createFixtureController(
  options: FixtureOptions = {},
): Promise<{
  ctrl: TimelineController;
  canvas: HTMLCanvasElement;
}> {
  const canvas = mountCanvas();
  const ctrl = await TimelineController.create(canvas, {
    initialViewStart: VIEW_START,
    initialViewEnd: VIEW_END,
    // Defaulted here rather than passed through as `undefined`, which
    // `exactOptionalPropertyTypes` rejects even though the controller would
    // have supplied the same no-op.
    onSelectionChange: options.onSelectionChange ?? (() => {}),
  });
  ctrl.setDataset(options.events ?? events);
  return { ctrl, canvas };
}

/**
 * Resolves after two animation frames have been painted.
 *
 * Nothing in a test drives Pixi's ticker: `create()` registers `render` on it
 * and returns, and a test that constructs and asserts synchronously tears the
 * controller down before the browser has painted once — so the controller
 * never draws unless a test explicitly yields to the frame loop. Two frames
 * rather than one because the ticker's first callback can land in the same
 * frame that scheduled it.
 */
export function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Tear down a controller and remove its canvas from the document. */
export function destroyFixture(
  ctrl: TimelineController,
  canvas: Element,
): void {
  ctrl.destroy();
  canvas.remove();
}
