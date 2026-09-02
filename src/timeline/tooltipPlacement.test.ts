import { describe, expect, it } from "vitest";

import { TOOLTIP_DX, TOOLTIP_DY, placeTooltip } from "./tooltipPlacement.js";

/**
 * An 800×400 view with a 200×100 tooltip: wide enough that the offsets are
 * visible in the numbers, small enough that every edge is reachable.
 */
const VIEWPORT = { width: 800, height: 400 };
const TOOLTIP = { width: 200, height: 100 };

const place = (x: number, y: number, tooltip = TOOLTIP) =>
  placeTooltip({ x, y }, tooltip, VIEWPORT);

describe("placeTooltip", () => {
  it("offsets from the cursor when the box fits", () => {
    expect(place(100, 200)).toEqual({
      x: 100 + TOOLTIP_DX,
      y: 200 + TOOLTIP_DY,
    });
  });

  it("flips to the left of the cursor at the right edge", () => {
    // 600 + 14 + 200 = 814, past the 800px edge, so the box goes left of the
    // cursor rather than sliding along the edge — sliding would put it under
    // the pointer and cover the event being described.
    expect(place(600, 200).x).toBe(600 - TOOLTIP_DX - TOOLTIP.width);
  });

  it("keeps the last unflipped position at the boundary", () => {
    // 586 + 14 + 200 = 800 exactly: the right edge is inclusive, so this is
    // the widest x that still opens to the right.
    expect(place(586, 200).x).toBe(586 + TOOLTIP_DX);
    expect(place(587, 200).x).toBe(587 - TOOLTIP_DX - TOOLTIP.width);
  });

  it("clamps to the left edge when the flipped box would go negative", () => {
    // Only reachable with a viewport too narrow to hold the box on either
    // side of the cursor; flipping alone is not enough there.
    expect(
      placeTooltip({ x: 190, y: 10 }, TOOLTIP, { ...VIEWPORT, width: 240 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("clamps to the top edge, where the negative offset overshoots", () => {
    // TOOLTIP_DY is -12, so any cursor within 12px of the top produced a
    // negative `top` before the clamp.
    expect(place(100, 0).y).toBe(0);
    expect(place(100, 11).y).toBe(0);
    expect(place(100, 12).y).toBe(0);
    expect(place(100, 13).y).toBe(1);
  });

  it("clamps to the bottom edge for a tall tooltip", () => {
    // A bin tooltip is tall: at y=395 the unclamped top of 383 puts its
    // bottom at 483, 83px past the viewport.
    expect(place(100, 395).y).toBe(VIEWPORT.height - TOOLTIP.height);
  });

  it("pins a box larger than the viewport to the top left", () => {
    // Degenerate, but the clamp must not invert: a max bound below zero would
    // otherwise win and place the box off-screen the other way.
    expect(place(400, 200, { width: 900, height: 500 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});
