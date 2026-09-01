import { describe, expect, it } from "vitest";

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
});
