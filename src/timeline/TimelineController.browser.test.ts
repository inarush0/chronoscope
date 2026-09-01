/**
 * `getEventAt` through the public surface of a real controller, in a real
 * headless Chromium (#42, #63). Nothing here is mocked: `create()` runs as
 * written, Pixi picks its own renderer, and the only concession to the test
 * environment is that the fixture gives the canvas inline dimensions, because
 * `main.css` is not loaded.
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
import {
  BAR_BOT_Y,
  BAR_TOP_Y,
  BAR_Y,
  DOT_Y,
  HIT,
  SPINE_Y,
  WIDTH,
  createFixtureController,
  destroyFixture,
  nextFrames,
} from "../test-support/timelineFixture.js";

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
