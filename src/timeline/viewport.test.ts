import { describe, expect, it } from "vitest";

import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from "../theme.js";
import type { TimelineEvent } from "./types.js";
import { UNCATEGORIZED, Viewport } from "./viewport.js";

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

    it("reports no extent when every event in a column shares a start", () => {
      const grid = TEN_COLUMNS.bins(10);

      const bins = grid.tally([ev(250), { ...ev(250), id: "twin" }]);

      // A zero-width extent is the signal callers fall back on: drilling into
      // this column has to open the column's own range, not an empty instant.
      expect(bins[2].firstStart).toBe(bins[2].lastStart);
      expect(grid.rangeAt(2)).toEqual({ start: 200, end: 300 });
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
});

/**
 * The default category key is deliberately absent from the palette.
 *
 * Renderers look a bin's dominant category up in `CATEGORY_COLORS` and fall
 * through to `DEFAULT_CATEGORY_COLOR` on a miss. That fall-through is the only
 * reason stamping uncategorised events with a real label instead of `""`
 * changes no pixel — adding an `"Uncategorized"` entry to the palette would
 * silently recolour every such bin, and this is the assertion that catches it.
 */
describe("the uncategorised key", () => {
  it("is not a palette entry, so it falls through to the default colour", () => {
    expect(CATEGORY_COLORS[UNCATEGORIZED]).toBeUndefined();
    expect(CATEGORY_COLORS[UNCATEGORIZED] ?? DEFAULT_CATEGORY_COLOR).toBe(
      DEFAULT_CATEGORY_COLOR,
    );
  });

  it("falls through exactly as the empty-string key it replaces did", () => {
    expect(CATEGORY_COLORS[""]).toBeUndefined();
  });
});
