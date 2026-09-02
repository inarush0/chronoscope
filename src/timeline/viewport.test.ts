import { describe, expect, it } from "vitest";

import { UNCATEGORIZED } from "../theme.js";
import type { TimelineEvent } from "./types.js";
import { Viewport } from "./viewport.js";

/**
 * The dataset's real extent: 4004 BCE to 62 CE, roughly 1.28e14 ms. Spans this
 * large are the reason the zoom invariant is worth asserting — at 800 px the
 * view starts at ~1.6e11 ms per pixel, so a transform that reconstructs the
 * cursor time by scaling both edges loses the low bits and the timeline slides
 * under the pointer as you wheel.
 */
const FULL_VIEW = new Viewport(
  Date.parse("-004003-01-01T00:00:00Z"),
  Date.parse("0062-01-01T00:00:00Z"),
  800,
);

describe("Viewport", () => {
  describe("time/pixel transforms", () => {
    it("maps the view edges to the canvas edges", () => {
      expect(FULL_VIEW.timeToPixel(FULL_VIEW.start)).toBe(0);
      expect(FULL_VIEW.timeToPixel(FULL_VIEW.end)).toBe(800);
    });

    it("round-trips a pixel back to itself", () => {
      expect(FULL_VIEW.timeToPixel(FULL_VIEW.pixelToTime(317))).toBeCloseTo(
        317,
        6,
      );
    });
  });

  describe("zoomAt", () => {
    // The invariant the whole gesture rests on: whatever the user has the
    // cursor over is the thing that stays put while the view scales around it.
    it.each([0, 1, 317, 400, 799, 800])(
      "leaves the time under cursor x=%i fixed",
      (cursorX) => {
        const before = FULL_VIEW.pixelToTime(cursorX);
        const after = FULL_VIEW.zoomAt(1.12, cursorX).pixelToTime(cursorX);
        expect(after).toBeCloseTo(before, 0);
      },
    );

    it("holds the anchor across a long wheel gesture", () => {
      const cursorX = 317;
      const anchor = FULL_VIEW.pixelToTime(cursorX);

      let view = FULL_VIEW;
      for (let i = 0; i < 60; i++) view = view.zoomAt(1.12, cursorX);

      // 60 ticks at 1.12 is ~1000x, down from millennia to a few years on
      // screen. Drift that survived a single step would be glaring by here.
      expect(view.span).toBeCloseTo(FULL_VIEW.span / 1.12 ** 60, 0);
      expect(view.pixelToTime(cursorX)).toBeCloseTo(anchor, 0);
    });

    it("is undone by zooming out about the same cursor", () => {
      const zoomed = FULL_VIEW.zoomAt(1.12, 600).zoomAt(1 / 1.12, 600);
      expect(zoomed.start).toBeCloseTo(FULL_VIEW.start, 0);
      expect(zoomed.end).toBeCloseTo(FULL_VIEW.end, 0);
    });
  });

  describe("dragBy", () => {
    it("moves the view backwards when the pointer goes right", () => {
      const dragged = FULL_VIEW.dragBy(80);
      expect(dragged.start).toBeLessThan(FULL_VIEW.start);
      expect(dragged.span).toBeCloseTo(FULL_VIEW.span, 0);
    });

    it("keeps the grabbed time under the pointer", () => {
      const grabbedAt = 200;
      const grabbed = FULL_VIEW.pixelToTime(grabbedAt);
      const dragged = FULL_VIEW.dragBy(120);
      expect(dragged.pixelToTime(grabbedAt + 120)).toBeCloseTo(grabbed, 0);
    });

    it("measures from the origin, so re-dragging does not accumulate", () => {
      // How the controller uses it: every pointermove re-applies the total
      // offset to the viewport captured at pointerdown.
      const once = FULL_VIEW.dragBy(150);
      const stepped = FULL_VIEW.dragBy(50).dragBy(50).dragBy(50);
      expect(stepped.start).toBeCloseTo(once.start, 0);
    });
  });

  describe("withRange / withWidth", () => {
    it("replaces the time range and keeps the canvas", () => {
      const zoomed = FULL_VIEW.withRange(0, 1000);
      expect(zoomed.start).toBe(0);
      expect(zoomed.end).toBe(1000);
      expect(zoomed.width).toBe(FULL_VIEW.width);
    });

    it("replaces the canvas width and keeps the time range", () => {
      // What a resize does: the same stretch of time, redrawn wider, so a
      // given time lands further across the canvas than it did.
      const resized = FULL_VIEW.withWidth(1600);
      expect(resized.width).toBe(1600);
      expect(resized.start).toBe(FULL_VIEW.start);
      expect(resized.end).toBe(FULL_VIEW.end);
      expect(resized.timeToPixel(resized.end)).toBe(1600);
    });
  });

  /**
   * The predicate that decides whether an event is drawn at all. An interval
   * only touching the view is still on screen, so the comparisons are
   * inclusive; a strict one would blink events out at the edge mid-pan.
   */
  describe("intersects", () => {
    const VIEW = new Viewport(0, 1000, 100);

    it("accepts an interval overlapping an edge", () => {
      expect(VIEW.intersects(-500, 200)).toBe(true);
      expect(VIEW.intersects(800, 5000)).toBe(true);
    });

    it("accepts an interval containing the whole view", () => {
      expect(VIEW.intersects(-5000, 5000)).toBe(true);
    });

    it("accepts an interval merely touching an edge", () => {
      expect(VIEW.intersects(-500, 0)).toBe(true);
      expect(VIEW.intersects(1000, 5000)).toBe(true);
    });

    it("rejects an interval entirely outside the view", () => {
      expect(VIEW.intersects(-5000, -4000)).toBe(false);
      expect(VIEW.intersects(4000, 5000)).toBe(false);
    });
  });

  describe("bins", () => {
    it("splits the canvas into whole columns of at least one bin", () => {
      expect(FULL_VIEW.bins(24).count).toBe(33);
      expect(new Viewport(0, 100, 10).bins(24).count).toBe(1);
    });

    it("assigns a time to the column whose range contains it", () => {
      const grid = FULL_VIEW.bins(24);
      const index = grid.indexAt(Date.parse("-001000-01-01T00:00:00Z"));
      const { start, end } = grid.rangeAt(index);
      expect(Date.parse("-001000-01-01T00:00:00Z")).toBeGreaterThanOrEqual(
        start,
      );
      expect(Date.parse("-001000-01-01T00:00:00Z")).toBeLessThan(end);
    });

    it("clamps times outside the view into the end columns", () => {
      const grid = FULL_VIEW.bins(24);
      expect(grid.indexAt(FULL_VIEW.start - FULL_VIEW.span)).toBe(0);
      expect(grid.indexAt(FULL_VIEW.end + FULL_VIEW.span)).toBe(32);
    });
  });

  /**
   * Round numbers rather than the real epoch here: 1000 ms across 100 px binned
   * at 10 px is ten columns of exactly 100 ms, so a start time reads as its own
   * column index and a miscounted bin is obvious rather than arithmetic.
   */
  describe("tally", () => {
    const TEN_COLUMNS = new Viewport(0, 1000, 100);

    /** `start` doubles as the id, so a failure names the event that moved. */
    function ev(
      start: number,
      rest: Partial<TimelineEvent> = {},
    ): TimelineEvent {
      return { id: `e${start}`, title: `event at ${start}`, start, ...rest };
    }

    it("counts each event into the column indexAt assigns it", () => {
      const grid = TEN_COLUMNS.bins(10);
      const events = [ev(0), ev(50), ev(150), ev(950)];

      const bins = grid.tally(events);

      expect(bins).toHaveLength(grid.count);
      expect(bins.map((b) => b.count)).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
      // The invariant the grid exists to hold: the renderer draws a bar where
      // tally counted it, and the hit-test asks indexAt where to look. They
      // agree because there is now one assignment, not two loops of it.
      for (const event of events) {
        expect(bins[grid.indexAt(event.start)].count).toBeGreaterThan(0);
      }
    });

    it("assigns an interval by its start, not by where it ends", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(50, { end: 950 })]);

      expect(bins[0].count).toBe(1);
      expect(bins[9].count).toBe(0);
    });

    it("keeps an interval that starts before the view but reaches into it", () => {
      const grid = TEN_COLUMNS.bins(10);

      // Clamped into column 0, which is where the renderer draws it too.
      const bins = grid.tally([ev(-5000, { end: 300 })]);

      expect(bins[0].count).toBe(1);
    });

    it("drops an event that has finished before the view starts", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(-5000, { end: -4000 }), ev(500)]);

      expect(bins.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    });

    it("stops at the first event past the view end", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(500), ev(9000), ev(99000)]);

      // Events arrive sorted, so the scan breaks rather than clamping the
      // off-screen tail into the last column.
      expect(bins[9].count).toBe(0);
      expect(bins.reduce((n, b) => n + b.count, 0)).toBe(1);
    });

    it("records the extent of the start times in a column", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(210), ev(240), ev(290)]);

      expect(bins[2].firstStart).toBe(210);
      expect(bins[2].lastStart).toBe(290);
    });

    it("tallies category votes, defaulting an absent category", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([
        ev(210, { category: "Abraham" }),
        ev(240, { category: "Abraham" }),
        ev(290),
      ]);

      expect(bins[2].votes).toEqual({ Abraham: 2, [UNCATEGORIZED]: 1 });
    });

    it("leaves an empty column with zero votes", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(210)]);

      expect(bins[5]).toMatchObject({ count: 0, votes: {} });
    });
  });

  /**
   * The hit-test wants one column, not all of them, and it asks on every
   * pointer move. Same assignment rule as `tally` — sharing that is the whole
   * point of the grid — but without building and discarding the other columns.
   */
  describe("tallyAt", () => {
    const TEN_COLUMNS = new Viewport(0, 1000, 100);
    const ev = (start: number, category?: string): TimelineEvent => ({
      id: `e${start}`,
      title: `event at ${start}`,
      start,
      ...(category === undefined ? {} : { category }),
    });

    it("matches the column tally computes for the same events", () => {
      const grid = TEN_COLUMNS.bins(10);
      const events = [ev(210, "Abraham"), ev(290), ev(500)];

      expect(grid.tallyAt(events, 2)).toEqual(grid.tally(events)[2]);
      expect(grid.tallyAt(events, 5)).toEqual(grid.tally(events)[5]);
      // Including the empty columns, which is where a divergence would hide.
      expect(grid.tallyAt(events, 7)).toEqual(grid.tally(events)[7]);
    });
  });

  /**
   * Where drilling into a density column takes you.
   *
   * This used to be a ternary inside the controller's hit-test, reachable only
   * through a canvas. It is a fact about a column and its contents, so it lives
   * on the grid and is assertable without one.
   */
  describe("zoomRangeAt", () => {
    const TEN_COLUMNS = new Viewport(0, 1000, 100);
    const ev = (id: string, start: number): TimelineEvent => ({
      id,
      title: id,
      start,
    });

    it("opens the extent of the column's start times", () => {
      const grid = TEN_COLUMNS.bins(10);
      const events = [ev("a", 210), ev("b", 240), ev("c", 290)];

      expect(grid.zoomRangeAt(2, grid.tallyAt(events, 2))).toEqual({
        start: 210,
        end: 290,
      });
    });

    it("opens the column's own range when every event shares a start", () => {
      const grid = TEN_COLUMNS.bins(10);
      const events = [ev("a", 250), ev("twin", 250)];

      // The zero-width case: zooming to 250–250 would open an empty instant,
      // so the column's own range is what the caller gets instead.
      expect(grid.zoomRangeAt(2, grid.tallyAt(events, 2))).toEqual({
        start: 200,
        end: 300,
      });
    });

    it("opens the column's own range for a lone event", () => {
      const grid = TEN_COLUMNS.bins(10);
      const events = [ev("only", 250)];

      expect(grid.zoomRangeAt(2, grid.tallyAt(events, 2))).toEqual({
        start: 200,
        end: 300,
      });
    });
  });
});
