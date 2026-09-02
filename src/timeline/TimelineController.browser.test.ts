/**
 * `TimelineController` through its public surface, on a real controller in a
 * real headless Chromium (#42, #63): hit-testing and `onFrame` (#63), then
 * `getGaps`, the LOD memo and selection (#64), then `getBinAt` and the view
 * math (#65). Nothing here is mocked: `create()` runs as written, Pixi picks
 * its own renderer, and the only concession to the test environment is that
 * the fixture gives the canvas inline dimensions, because `main.css` is not
 * loaded.
 *
 * Why the pixels are checkable rather than copied: the fixture's view spans
 * 800 days across 800 px, so an event's start in days is its x. The y values
 * come from `timelineFixture.ts`, which restates the layout constants
 * `renderLODB` and `getEventAt` each derive privately — #43 ruled against
 * extracting that derivation, so these assertions are what hold the drawn
 * geometry and the hit-tested geometry in agreement.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_COLORS } from "../theme.js";
import type { TimelineController } from "./TimelineController.js";
import type { TimelineEvent } from "./types.js";
import {
  BAR_BOT_Y,
  BAR_TOP_Y,
  BAR_Y,
  DAY,
  DOT_Y,
  GAP_Y,
  HEIGHT,
  HIT,
  SPINE_Y,
  VIEW_END,
  VIEW_START,
  WIDTH,
  createFixtureController,
  destroyFixture,
  events as fixtureEvents,
  nextFrames,
} from "../test-support/timelineFixture.js";

/** An instant at day `day`, which on the fixture's view is x = `day`. */
function instantAt(day: number): TimelineEvent {
  return { id: `d${day}`, start: day * DAY, title: `Day ${day}` };
}

/**
 * A gap list as `[x1, x2]` pairs, rounded to the nearest thousandth of a pixel.
 *
 * `timeToPixel` is a float division, so a day that ought to land on 402 lands
 * on 401.99999999999994. The rounding is there and no wider than that: a pair
 * that is a whole pixel off still fails.
 */
function spans(gaps: { x1: number; x2: number }[]): number[][] {
  const px = (n: number) => Math.round(n * 1000) / 1000;
  return gaps.map((g) => [px(g.x1), px(g.x2)]);
}

/**
 * A pointer event at canvas coordinates (x, y).
 *
 * The controller reads `offsetX`/`offsetY`, which the browser derives from
 * `clientX`/`clientY` against the target's box — so the caller gives view
 * coordinates and the rect does the conversion, exactly as `timelineView`'s
 * hover tests do.
 */
function pointer(
  canvas: HTMLCanvasElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
): void {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: rect.left + x,
      clientY: rect.top + y,
      pointerId: 1,
      bubbles: true,
    }),
  );
}

/** Press at `fromX` and move to `toX`, which pans the view by the difference. */
function drag(canvas: HTMLCanvasElement, fromX: number, toX: number): void {
  pointer(canvas, "pointerdown", fromX, SPINE_Y);
  pointer(canvas, "pointermove", toX, SPINE_Y);
}

/** Press and release without moving, which the controller reads as a click. */
function click(canvas: HTMLCanvasElement, x: number, y: number): void {
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointerup", x, y);
}

/**
 * One wheel tick in at `x`. Negative `deltaY` is the zoom-in direction
 * `onWheel` reads, and the event has to be cancelable because the handler
 * calls `preventDefault` on it.
 */
function zoomIn(canvas: HTMLCanvasElement, x: number): void {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new WheelEvent("wheel", {
      clientX: rect.left + x,
      clientY: rect.top + SPINE_Y,
      deltaY: -1,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * The default fixture's gaps, which stand in for "the view is where it
 * started" throughout the view-math tests below. Every x is the event's start
 * in days, because the fixture is rigged to one day per pixel.
 */
const DEFAULT_GAPS = [
  [100, 400],
  [400, 402],
  [402, 600],
  [600, 650],
];

describe("TimelineController.getEventAt", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    ({ ctrl, canvas } = await createFixtureController());
  });

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /**
   * The guard on every assertion below, and the reason it is a separate test.
   * A canvas that never got a box has width 0, which makes `pxPerEvent` 0,
   * which flips LOD to "A", at which point `getEventAt` returns null for every
   * input. A suite of misses would be green against a controller that cannot
   * hit-test at all.
   */
  it("is measuring a laid-out canvas in LOD B", () => {
    expect(canvas.clientWidth).toBe(WIDTH);
    expect(ctrl.lod).toBe("B");
  });

  describe("instant markers", () => {
    // instant-a is drawn at x = 100; its dot sits at DOT_Y.
    it("hits an instant's dot", () => {
      expect(ctrl.getEventAt(100, DOT_Y)?.id).toBe("instant-a");
    });

    // HIT is 8 px, so 9 px off-centre is the nearest miss on either side.
    it.each([100 - (HIT + 1), 100 + (HIT + 1)])(
      "misses at x=%i, just outside the hit target",
      (x) => {
        expect(ctrl.getEventAt(x, DOT_Y)).toBeNull();
      },
    );
  });

  describe("interval bars", () => {
    // interval-c spans x = 600..700. x = 620 is inside it and 30 px clear of
    // instant-d, so nothing but the bar can answer.
    it("hits an interval's bar", () => {
      expect(ctrl.getEventAt(620, BAR_Y)?.id).toBe("interval-c");
    });

    /**
     * The y-band, from three sides. Above the bar and below the spine both
     * leave through the early guard; between the bar and the spine falls all
     * the way through both passes, which is the case that would still pass if
     * the guard were wrong.
     */
    it.each([
      ["above the bar", BAR_TOP_Y - HIT - 1],
      ["between the bar and the spine", BAR_BOT_Y + HIT + 1],
      ["below the spine", SPINE_Y + HIT + 1],
    ])("misses %s, at y=%i", (_where, y) => {
      expect(ctrl.getEventAt(620, y)).toBeNull();
    });
  });

  /**
   * instant-d sits at x = 650, inside interval-c's 600..700 span. The two hit
   * regions meet on exactly one row — the instant's band starts at DOT_Y - HIT
   * and the bar's ends at BAR_BOT_Y + HIT, and both are SPINE_Y - 26 — so this
   * is the one pixel where the answer is decided by which of them is tested
   * first rather than by geometry. It must be the instant: `renderLODB` draws
   * dots in a second pass, on top of the bars, so the topmost thing drawn is
   * the thing the click resolves to.
   */
  it("resolves an overlap to the instant drawn on top", () => {
    const overlapY = DOT_Y - HIT;
    expect(overlapY).toBe(SPINE_Y - 26);
    expect(ctrl.getEventAt(650, overlapY)?.id).toBe("instant-d");
  });

  /**
   * Two instants whose hit targets overlap: instant-b at x = 400, instant-e at
   * x = 402. x = 403 is nearer to instant-e (1 px) than to instant-b (3 px),
   * and the answer is still instant-b — `getEventAt` returns the first match
   * in the dataset's sort order, which is by start time, and does not compare
   * distances. Pinned because "nearest" is the intuitive reading and the wrong
   * one; a future change to prefer the closer target should fail here and be a
   * decision, not an accident.
   */
  it("resolves two overlapping instants to the earlier, not the nearer", () => {
    expect(ctrl.getEventAt(403, DOT_Y)?.id).toBe("instant-b");
  });

  // Empty stretches of the timeline: before the first event and after the last.
  it.each([20, 760])("returns null at x=%i, where nothing is drawn", (x) => {
    expect(ctrl.getEventAt(x, DOT_Y)).toBeNull();
  });
});

/**
 * The other half of the contract the DOM overlay depends on. `onFrame` exists
 * so the gap indicators repaint in lockstep with the canvas instead of from a
 * second `requestAnimationFrame` loop, which on a dropped frame could paint
 * DOM from a different view state than the canvas underneath it. Asserted
 * here: a subscriber is called as frames are painted, and the returned
 * unsubscribe stops it. That it runs *after* the draw rather than before is
 * not asserted — observing the order would mean reaching into what Pixi drew.
 *
 * This is also the only test that lets the controller actually draw. Every
 * test above constructs, asserts and tears down within a single task, so
 * Pixi's ticker never fires and `render` never runs.
 */
describe("TimelineController.onFrame", () => {
  it("runs subscribers per frame until unsubscribed", async () => {
    const { ctrl, canvas } = await createFixtureController();
    try {
      let frames = 0;
      const unsubscribe = ctrl.onFrame(() => {
        frames += 1;
      });

      await nextFrames();
      expect(frames).toBeGreaterThan(0);

      unsubscribe();
      const afterUnsubscribe = frames;
      await nextFrames();
      expect(frames).toBe(afterUnsubscribe);
    } finally {
      destroyFixture(ctrl, canvas);
    }
  });
});

/**
 * `getGaps` reports the empty stretches between consecutive events as pixel
 * spans for the DOM overlay to draw. Every x below is arithmetic against the
 * fixture's one-day-per-pixel view — an event's start in days is its x — and
 * `GAP_Y` restates the offset the connector line is drawn at.
 *
 * The label strings are `formatDuration`'s, tested in `format.test.ts` (#50)
 * and not re-enumerated here. One label is asserted, on the gap whose span is
 * unambiguous, and only to pin that a gap is labelled with *its own* span.
 */
describe("TimelineController.getGaps", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  /** The fixture, minus the dataset — every test here brings its own. */
  async function mount(events: TimelineEvent[]): Promise<void> {
    ({ ctrl, canvas } = await createFixtureController({ events }));
  }

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  it("reports one gap across a hole, below the spine", async () => {
    await mount([instantAt(100), instantAt(500)]);
    expect(ctrl.lod).toBe("B");

    const gaps = ctrl.getGaps();
    expect(spans(gaps)).toEqual([[100, 500]]);
    // `GAP_Y` is the fixture's restatement of the offset below the spine that
    // the connector line is drawn at; the overlay draws under the events.
    expect(gaps[0].y).toBe(GAP_Y);
    // The one label asserted here. `formatDuration`'s cases belong to
    // `format.test.ts` (#50) and are not re-run; what this pins is that the
    // gap carries a label for *its own* span — 400 days, which is 1.09 mean
    // Julian years — rather than for the neighbouring pair or the whole view.
    expect(gaps[0].label).toBe("1 yr");
  });

  /**
   * A pair with no span at all. There is no minimum width — the next test pins
   * that a 2px gap is still reported — so what this reaches is the `x2 <= x1`
   * half of the guard, and two events sharing a start time are the only way to
   * reach it going forwards. (The other half, `x2 < 0`, is two tests down.)
   */
  it("reports no gap between two events that share a start time", async () => {
    await mount([instantAt(300), { ...instantAt(300), id: "also-300" }]);
    expect(ctrl.lod).toBe("B");
    expect(ctrl.getGaps()).toEqual([]);
  });

  /**
   * The default fixture, whose five events give four consecutive pairs: one of
   * them is instant-b to instant-e, 2px apart. All four are reported, which is
   * what says the filtering above is about zero-width pairs and not about
   * small ones.
   */
  it("reports every consecutive pair, however narrow", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    expect(ctrl.lod).toBe("B");
    expect(spans(ctrl.getGaps())).toEqual([
      [100, 400],
      [400, 402],
      [402, 600],
      [600, 650],
    ]);
  });

  /**
   * Gaps are clipped by the loop, not by the numbers: an endpoint off either
   * edge is returned as the negative or over-width x it is, and the overlay
   * clips it. What the loop drops is a pair with *nothing* on screen.
   *
   * Both ends at once: the -200→300 pair reaches in from the left, 300→900
   * reaches out to the right, and 900→1000 is past the right edge entirely and
   * is dropped.
   *
   * That last drop pins the `x1 > w` guard but *not* its being a `break`.
   * Once one x1 is past the edge every later one is too, so a `continue` there
   * returns the identical list and only costs a walk to the end of the
   * dataset — a difference no assertion on the return value can see.
   */
  it("keeps a gap that runs off an edge and drops one entirely off it", async () => {
    await mount([
      instantAt(-200),
      instantAt(300),
      instantAt(900),
      instantAt(1000),
    ]);
    expect(ctrl.lod).toBe("B");
    expect(spans(ctrl.getGaps())).toEqual([
      [-200, 300],
      [300, 900],
    ]);
  });

  it("drops a gap that ends before the left edge", async () => {
    await mount([instantAt(-400), instantAt(-200), instantAt(300)]);
    expect(ctrl.lod).toBe("B");
    expect(spans(ctrl.getGaps())).toEqual([[-200, 300]]);
  });

  /**
   * In LOD A there are no individual events drawn to sit between, so there is
   * nothing to label. 30 events across 800px is 26.7 px each, under the
   * threshold of 40.
   */
  it("reports nothing in LOD A", async () => {
    await mount(Array.from({ length: 30 }, (_, i) => instantAt(i * 20)));
    expect(ctrl.lod).toBe("A");
    expect(ctrl.getGaps()).toEqual([]);
  });
});

/**
 * The `lod` getter memoises on four fields, and the memo is the thing worth
 * testing (#43): the threshold arithmetic is two lines, but a stale answer
 * from a key missing a field is a wrong LOD for the rest of the session. So
 * each test below moves *one* field and asserts the answer follows.
 *
 * Every one of them reads `lod` before changing anything, which is not
 * ceremony — an unprimed memo computes on the first read no matter what the
 * key is, and the assertion would hold against a controller that never
 * memoised or one that never invalidated.
 *
 * 30 events across 800px is 26.7 px each, under the threshold of 40, and 5 is
 * 160 px, over it. Those are the two sides every case below moves between.
 */
describe("TimelineController.lod memo", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /** `viewWidth`, which only a resize moves — no view or dataset change here. */
  it("recomputes after a resize narrows the canvas", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    expect(ctrl.lod).toBe("B");

    // 5 events across 100px is 20 px each, under the threshold.
    ctrl.resize(100, HEIGHT);
    expect(ctrl.lod).toBe("A");
  });

  /** `events.length`, which only a dataset change moves. */
  it("recomputes after a dataset with more events is loaded", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    expect(ctrl.lod).toBe("B");

    ctrl.setDataset(Array.from({ length: 30 }, (_, i) => instantAt(i * 20)));
    expect(ctrl.lod).toBe("A");
  });

  /**
   * The case the getter's doc-comment names, and the reason the memo is keyed
   * exactly rather than reset per frame: a pointer move that pans between two
   * renders has to see its own view state, not the last frame's.
   *
   * So the pan below is a real drag on the real canvas — pointerdown, one
   * move — and `lod` is read straight after it, with no frame allowed to pass.
   * The dataset is 30 events packed into the first 90px plus two stragglers
   * out at 700 and 750; dragging 600px left leaves the view over the two, and
   * 400 px per event is comfortably back in LOD B.
   */
  it("sees a pan that no frame has rendered yet", async () => {
    const cluster = Array.from({ length: 30 }, (_, i) => instantAt(i * 3));
    ({ ctrl, canvas } = await createFixtureController({
      events: [...cluster, instantAt(700), instantAt(750)],
    }));
    expect(ctrl.lod).toBe("A");

    drag(canvas, 700, 100);
    expect(ctrl.lod).toBe("B");
  });

  /**
   * The same pan, taken far enough that nothing is left on screen. An empty
   * view has no px-per-event to compare against the threshold, and the answer
   * is "B" — a division by zero here would be Infinity and read as "B" by
   * luck, so the early return is what makes it deliberate. Reached from "A",
   * because starting from "B" would prove nothing about which branch answered.
   */
  it("reads an empty view as LOD B", async () => {
    const cluster = Array.from({ length: 30 }, (_, i) => instantAt(i * 3));
    ({ ctrl, canvas } = await createFixtureController({
      events: [...cluster, instantAt(700), instantAt(750)],
    }));
    expect(ctrl.lod).toBe("A");

    // 790 days forward leaves the view at 790..1590, past the last event.
    drag(canvas, 790, 0);
    expect(ctrl.lod).toBe("B");
  });
});

/**
 * `selectEvent` is private and reached only through a click, which is what
 * these drive: a pointerdown and a pointerup within `MIN_CLICK_MOVEMENT` of
 * each other. The observable is `onSelectionChange`, the callback the app
 * shell hangs the detail panel off.
 */
describe("TimelineController selection", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;
  let selections: (string | null)[];

  beforeEach(async () => {
    selections = [];
    ({ ctrl, canvas } = await createFixtureController({
      onSelectionChange: (id) => selections.push(id),
    }));
  });

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  it("reports the id of the event clicked", () => {
    click(canvas, 100, DOT_Y);
    expect(selections).toEqual(["instant-a"]);
  });

  it("reports null when the click lands on nothing", () => {
    click(canvas, 100, DOT_Y);
    click(canvas, 20, DOT_Y);
    expect(selections).toEqual(["instant-a", null]);
  });

  /**
   * Current behaviour, pinned rather than endorsed: there is no dedupe, so
   * re-clicking the selected event fires again with the same id. Harmless for
   * today's subscriber, which rebuilds the panel from the id either way. If a
   * subscriber ever gets an animation or a fetch on it, this test failing is
   * the notice that the dedupe has to be added deliberately.
   */
  it("re-fires when the same event is clicked twice", () => {
    click(canvas, 100, DOT_Y);
    click(canvas, 100, DOT_Y);
    expect(selections).toEqual(["instant-a", "instant-a"]);
  });
});

// ─── LOD A: the density grid ─────────────────────────────────────────────────

/**
 * `LOD_BIN_WIDTH`, restated. `renderLODA` draws column `i` at `i * 24` and
 * `getBinAt` inverts that with `floor(x / 24)`, so the column index and the
 * pixel are the same fact and a test can address a column by pointing at it.
 */
const BIN_WIDTH = 24;

/** What `Viewport.bins(24)` divides an 800px canvas into: `floor(800/24)`. */
const BIN_COUNT = Math.floor(WIDTH / BIN_WIDTH);

/**
 * The time each column covers — the view's span divided by the column count,
 * *not* 24 days. The grid is 33 columns of 24.24 days across a view of 800,
 * because 33 columns of 24px only reach x = 792; the last 8px of canvas
 * belong to no column at all, which is what the out-of-range case below
 * pins.
 */
const TIME_PER_BIN = (VIEW_END - VIEW_START) / BIN_COUNT;

/** A time `fraction` of the way through column `i`. */
function timeInBin(i: number, fraction: number): number {
  return (i + fraction) * TIME_PER_BIN;
}

/** The x that lands in the middle of column `i`'s drawn 24px. */
function binX(i: number): number {
  return i * BIN_WIDTH + BIN_WIDTH / 2;
}

const MIXED_BIN = 10;
const EMPTY_BIN = 15;
/**
 * Where the mixed column's interval ends — day 700, which is column 28, well
 * clear of the column the interval is counted in.
 */
const MIX_SPAN_END = 700 * DAY;
/**
 * The last column, deliberately: it is what makes the off-the-grid case below
 * discriminating. A lookup that clamped x into the grid instead of rejecting
 * it would report this column's two events for a pointer past its right edge.
 */
const COINCIDENT_BIN = BIN_COUNT - 1;

/**
 * A dataset shaped for LOD A: 26 events across 800px is 30.8 px each, under
 * the threshold of 40. The count is what puts the controller in LOD A, so the
 * bulk of it is filler parked in column 0, leaving the columns the assertions
 * address to hold exactly what they are about.
 */
function binnedEvents(): TimelineEvent[] {
  /** 21 distinct starts inside column 0, enough on their own to force LOD A. */
  const filler: TimelineEvent[] = Array.from({ length: 21 }, (_, k) => ({
    id: `filler-${k}`,
    start: timeInBin(0, (k + 0.5) / 21),
    title: `Filler ${k}`,
    category: "Filler",
  }));

  return [
    ...filler,
    // Column 10: three events, two categories, three distinct starts. The
    // middle one is an interval running out to day 700, which is column 28 —
    // so a `zoomEnd` taken from end times instead of start times would be
    // visibly wrong here rather than coincidentally right.
    {
      id: "mix-early",
      start: timeInBin(MIXED_BIN, 0.25),
      title: "Mix Early",
      category: "Reign",
    },
    {
      id: "mix-span",
      start: timeInBin(MIXED_BIN, 0.5),
      end: MIX_SPAN_END,
      title: "Mix Span",
      category: "Exile",
    },
    {
      id: "mix-late",
      start: timeInBin(MIXED_BIN, 0.75),
      title: "Mix Late",
      category: "Reign",
    },
    // The last column: two events sharing one start, the case with no extent
    // to zoom to.
    {
      id: "twin-a",
      start: timeInBin(COINCIDENT_BIN, 0.5),
      title: "Twin A",
      category: "Exile",
    },
    {
      id: "twin-b",
      start: timeInBin(COINCIDENT_BIN, 0.5),
      title: "Twin B",
      category: "Exile",
    },
  ];
}

/**
 * `getBinAt` is `getEventAt`'s counterpart on the far side of the LOD switch:
 * zoomed out, there are no individual events drawn to hit, only density
 * columns. Which events land in which column is `BinGrid`'s, asserted without
 * a canvas in `viewport.test.ts` (#49); what is left here is what the
 * controller hands the drill-down — the column under a given pixel, its
 * contents, and the range double-clicking it opens.
 */
describe("TimelineController.getBinAt", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    ({ ctrl, canvas } = await createFixtureController({
      events: binnedEvents(),
    }));
  });

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /**
   * The guard on everything below, and a separate test for the same reason
   * the LOD B one is: `getBinAt` returns null unconditionally outside LOD A,
   * so a suite of misses would be green against a controller that never
   * entered the mode under test.
   */
  it("is measuring a laid-out canvas in LOD A", () => {
    expect(canvas.clientWidth).toBe(WIDTH);
    expect(ctrl.lod).toBe("A");
  });

  it("reports the count and categories of the column's events", () => {
    const bin = ctrl.getBinAt(binX(MIXED_BIN), 100);
    expect(bin?.count).toBe(3);
    // Sorted by count descending — two Reigns before one Exile.
    expect(bin?.categories).toEqual([
      { name: "Reign", count: 2 },
      { name: "Exile", count: 1 },
    ]);
  });

  it("reports the column's own time range", () => {
    const bin = ctrl.getBinAt(binX(MIXED_BIN), 100);
    expect(bin?.timeStart).toBe(MIXED_BIN * TIME_PER_BIN);
    expect(bin?.timeEnd).toBe((MIXED_BIN + 1) * TIME_PER_BIN);
  });

  /**
   * The rule the `BinInfo` doc-comment argues for, pinned so that a future
   * "surely it should cover the whole event" cannot land silently. `mix-span`
   * runs out to day 700, eighteen columns past the one it is counted in;
   * taking the extent of end times would open a view some thirty times wider
   * than this one and leave all three events crushed against its left edge.
   */
  it("zooms to the extent of the column's start times, not its end times", () => {
    const bin = ctrl.getBinAt(binX(MIXED_BIN), 100);
    expect(bin?.zoomStart).toBe(timeInBin(MIXED_BIN, 0.25));
    expect(bin?.zoomEnd).toBe(timeInBin(MIXED_BIN, 0.75));
    expect(bin?.zoomEnd).toBeLessThan(MIX_SPAN_END);
  });

  /**
   * The documented fallback. Two events sharing a start have no extent, and
   * zooming to it would open a zero-width window on an empty instant, so the
   * column's own range stands in. Asserted here as well as against `BinGrid`
   * because the range the *controller* returns is the one the drill-down
   * uses.
   */
  it("falls back to the column range when every event shares a start", () => {
    const bin = ctrl.getBinAt(binX(COINCIDENT_BIN), 100);
    expect(bin?.count).toBe(2);
    // The column's own range, stated from the grid arithmetic rather than
    // read back off `bin.timeStart` — comparing the result to itself would
    // hold just as well against a bin that reported nothing.
    expect(bin?.zoomStart).toBe(COINCIDENT_BIN * TIME_PER_BIN);
    expect(bin?.zoomEnd).toBe((COINCIDENT_BIN + 1) * TIME_PER_BIN);
  });

  /**
   * The y-band is wider than the bars: a column's bar is at most 60px tall
   * above the spine, but the whole canvas above the spine answers, so a
   * pointer high over a short bar still reports the column beneath it.
   */
  it.each([
    ["the top of the canvas", 0],
    ["well above the tallest bar", 100],
    ["just below the spine", SPINE_Y + 8],
  ])("answers at %s, y=%i", (_where, y) => {
    expect(ctrl.getBinAt(binX(MIXED_BIN), y)?.count).toBe(3);
  });

  it.each([
    ["above the canvas", -1],
    ["too far below the spine", SPINE_Y + 9],
  ])("misses %s, at y=%i", (_where, y) => {
    expect(ctrl.getBinAt(binX(MIXED_BIN), y)).toBeNull();
  });

  it("returns null over a column no event landed in", () => {
    expect(ctrl.getBinAt(binX(EMPTY_BIN), 100)).toBeNull();
  });

  /**
   * 33 columns of 24px reach x = 792, so the canvas's last 8px are off the
   * right end of the grid — `floor(795 / 24)` is 33, one past the last index.
   * A negative x is the same case from the other side.
   *
   * Both neighbours are occupied, which is what gives these teeth: the last
   * column holds the coincident pair and column 0 holds the filler, so a
   * lookup that clamped into the grid rather than rejecting would answer with
   * a count instead of a null.
   *
   * What this pins is the null, not the range check that produces it. No event
   * can be tallied into an index outside the grid — `indexAt` clamps — so an
   * out-of-range index tallies to zero and leaves by the empty-column path
   * anyway. Widening the check to `binIdx > grid.count` returns the identical
   * null, and no assertion on the return value can see the difference.
   */
  it.each([795, -1])("returns null at x=%i, which is in no column", (x) => {
    expect(ctrl.getBinAt(x, 100)).toBeNull();
  });

  /**
   * Zoomed in, `getEventAt` answers and this does not — the two are exclusive
   * by LOD, not by geometry. So the probe is at column 4, which is where
   * instant-a's day 100 falls on the fixture's default view: a controller that
   * had lost the LOD guard would happily report a column of one there.
   */
  it("returns null in LOD B, where individual events are drawn instead", async () => {
    destroyFixture(ctrl, canvas);
    ({ ctrl, canvas } = await createFixtureController());
    expect(ctrl.lod).toBe("B");
    expect(ctrl.getEventAt(100, DOT_Y)?.id).toBe("instant-a");
    expect(ctrl.getBinAt(binX(4), 100)).toBeNull();
  });
});

// ─── View math ───────────────────────────────────────────────────────────────

/**
 * What moves the window of time on screen, observed through `getGaps` — a
 * gap's x is `timeToPixel` of an event's start, so the gap list is a readout
 * of the current view in the fixture's one-day-per-pixel units.
 *
 * `timeToPixel` and `setView` are one-line delegations to `Viewport`, whose
 * arithmetic `viewport.test.ts` already pins; nothing here restates it.
 */
describe("TimelineController.resetView", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    ({ ctrl, canvas } = await createFixtureController());
  });

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /**
   * Dragging left from 700 to 600 moves the view 100 days forward, so every
   * event's x drops by 100 — far enough to be unambiguous, near enough that
   * all four gaps stay on screen and the readout is the whole view. Reset puts
   * it back.
   */
  it("returns to the default view after a pan", () => {
    drag(canvas, 700, 600);
    expect(spans(ctrl.getGaps())).toEqual([
      [0, 300],
      [300, 302],
      [302, 500],
      [500, 550],
    ]);

    ctrl.resetView();
    expect(spans(ctrl.getGaps())).toEqual(DEFAULT_GAPS);
  });

  /**
   * One wheel tick in. Where exactly the zoom leaves each event is
   * `Viewport.zoomAt`'s, and `viewport.test.ts` pins it — including the
   * cursor-anchor invariant — so all this needs of the zoom is that it moved
   * the view. What it asserts is the return trip.
   */
  it("returns to the default view after a zoom", () => {
    zoomIn(canvas, 400);
    expect(spans(ctrl.getGaps())).not.toEqual(DEFAULT_GAPS);

    ctrl.resetView();
    expect(spans(ctrl.getGaps())).toEqual(DEFAULT_GAPS);
  });
});

describe("TimelineController.zoomToSelection", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /**
   * An instant has no span of its own, so the padding falls to the other side
   * of the `max`: 5% of the 800-day view is 40 days either side, giving a view
   * of 60..140 days across 800px. instant-a, at day 100, is therefore centred
   * at x = 400 — and no longer anywhere near x = 100, which is where it was.
   */
  it("centres a selected instant", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    click(canvas, 100, DOT_Y);

    ctrl.zoomToSelection();

    expect(ctrl.getEventAt(400, DOT_Y)?.id).toBe("instant-a");
    expect(ctrl.getEventAt(100, DOT_Y)).toBeNull();
  });

  /**
   * An interval wide enough for its own half-span to win the `max`:
   * interval-c spans 100 days, so the padding is 50 days either side and the
   * view becomes 550..750 across 800px — 4px per day, putting the bar's ends
   * at x = 200 and x = 600 with the padding visible on both sides.
   */
  it("frames a selected interval with padding on both sides", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    click(canvas, 620, BAR_Y);
    expect(ctrl.getEventAt(620, BAR_Y)?.id).toBe("interval-c");

    ctrl.zoomToSelection();

    expect(ctrl.getEventAt(200, BAR_Y)?.id).toBe("interval-c");
    expect(ctrl.getEventAt(600, BAR_Y)?.id).toBe("interval-c");
    // The left padding: 9px outside the bar's end is past the hit target.
    expect(ctrl.getEventAt(200 - (HIT + 1), BAR_Y)).toBeNull();
  });

  /** Nothing selected, nothing to frame — current behaviour, pinned. */
  it("does nothing with no selection", async () => {
    ({ ctrl, canvas } = await createFixtureController());

    ctrl.zoomToSelection();

    expect(spans(ctrl.getGaps())).toEqual(DEFAULT_GAPS);
  });

  /**
   * A selected id outlives the dataset it came from: `setDataset` replaces the
   * events without clearing the selection, so the id can no longer be
   * resolved. The view stays put rather than zooming to a guess.
   */
  it("does nothing when the selected id is no longer in the dataset", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    click(canvas, 100, DOT_Y);

    ctrl.setDataset([instantAt(300), instantAt(500)]);
    ctrl.zoomToSelection();

    expect(spans(ctrl.getGaps())).toEqual([[300, 500]]);
  });

  /**
   * The drill-down, end to end: a click in LOD A selects the column under it,
   * and `zoomToSelection` opens the range that column reported. The bin holds
   * three events over 0.5 of a column's time, padded by 20% either side — a
   * view narrow enough that the three are now individually drawn, which is
   * the whole point of drilling in.
   */
  it("drills into a clicked column", async () => {
    ({ ctrl, canvas } = await createFixtureController({
      events: binnedEvents(),
    }));
    expect(ctrl.lod).toBe("A");
    click(canvas, binX(MIXED_BIN), 100);

    ctrl.zoomToSelection();

    expect(ctrl.lod).toBe("B");
    // The bin's extent is 0.5 of a column wide and the padding adds 0.1 either
    // side, so the 0.7-column view puts mix-early 1/7 of the way across and
    // mix-late 6/7.
    expect(ctrl.getEventAt((WIDTH * 1) / 7, DOT_Y)?.id).toBe("mix-early");
    expect(ctrl.getEventAt((WIDTH * 6) / 7, DOT_Y)?.id).toBe("mix-late");
  });
});

describe("TimelineController.setDataset", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    ({ ctrl, canvas } = await createFixtureController());
  });

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  it("replaces the events rather than adding to them", () => {
    expect(ctrl.getEventAt(100, DOT_Y)?.id).toBe("instant-a");

    ctrl.setDataset([instantAt(300)]);

    expect(ctrl.getEventAt(300, DOT_Y)?.id).toBe("d300");
    expect(ctrl.getEventAt(100, DOT_Y)).toBeNull();
  });

  /**
   * The sort is load-bearing, not tidiness: `getGaps` pairs each event with
   * the next one in the array and stops at the first x past the right edge,
   * both of which are only correct on a list ordered by start. Handed the
   * fixture's events backwards, the controller still reports the same four
   * gaps in the same order.
   */
  it("sorts the events by start time", () => {
    ctrl.setDataset([...fixtureEvents].reverse());
    expect(spans(ctrl.getGaps())).toEqual(DEFAULT_GAPS);
  });

  /** The caller's array is not the controller's; sorting must not reach back. */
  it("does not reorder the caller's array", () => {
    const events = [instantAt(500), instantAt(100)];
    ctrl.setDataset(events);
    expect(events.map((e) => e.id)).toEqual(["d500", "d100"]);
  });
});

/**
 * `setColors` by consequence: the controller repaints its background from the
 * theme it was given, so the pixel that comes back off the canvas is the
 * theme's `background` and nothing else is asserted about the drawing. No
 * spies, and no snapshot — one pixel, compared against the constant the app
 * shell passes in.
 *
 * (5, 5) because it is above everything drawn: this runs on the default
 * fixture, which is in LOD B, and the topmost thing `renderLODB` draws is an
 * interval bar's top edge at `BAR_TOP_Y`, 158.
 *
 * What this does not reach is the `renderer.background.color` half of
 * `setColors`. `renderBackground` fills the whole canvas from the same theme
 * on every frame, so the renderer's clear colour is painted over before
 * anything can observe it.
 */
describe("TimelineController.setColors", () => {
  let ctrl: TimelineController;
  let canvas: HTMLCanvasElement;

  afterEach(() => {
    destroyFixture(ctrl, canvas);
  });

  /** The rendered colour at (5, 5), as the `0xrrggbb` the theme states it in. */
  async function backgroundPixel(): Promise<number> {
    await nextFrames();
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = canvas.toDataURL();
    });
    const readback = document.createElement("canvas");
    readback.width = image.width;
    readback.height = image.height;
    const context = readback.getContext("2d");
    if (!context) throw new Error("no 2d context for readback");
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(5, 5, 1, 1).data;
    return (r << 16) | (g << 8) | b;
  }

  it("repaints the background in the theme it is given", async () => {
    ({ ctrl, canvas } = await createFixtureController());
    // The fixture takes the controller's own default, which is the light
    // theme — so the second assertion is a change, not a coincidence.
    expect(await backgroundPixel()).toBe(THEME_COLORS.light.background);

    ctrl.setColors(THEME_COLORS.dark);

    expect(await backgroundPixel()).toBe(THEME_COLORS.dark.background);
  });
});
