/**
 * `TimelineController` through its public surface, on a real controller in a
 * real headless Chromium (#42, #63): hit-testing and `onFrame` (#63), then
 * `getGaps`, the LOD memo and selection (#64). Nothing here is mocked:
 * `create()` runs as written, Pixi picks its own renderer, and the only
 * concession to the test environment is that the fixture gives the canvas
 * inline dimensions, because `main.css` is not loaded.
 *
 * Why the pixels are checkable rather than copied: the fixture's view spans
 * 800 days across 800 px, so an event's start in days is its x. The y values
 * come from `timelineFixture.ts`, which restates the layout constants
 * `renderLODB` and `getEventAt` each derive privately — #43 ruled against
 * extracting that derivation, so these assertions are what hold the drawn
 * geometry and the hit-tested geometry in agreement.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  WIDTH,
  createFixtureController,
  destroyFixture,
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
