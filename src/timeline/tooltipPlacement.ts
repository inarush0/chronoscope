/**
 * Where the hover tooltip goes, as arithmetic over four numbers.
 *
 * Kept out of `timelineView.ts` because the answer depends on nothing but the
 * cursor, the box and the box it lives in — no DOM, no measurement, no Pixi —
 * and the edge branches are exactly the part worth pinning. Measuring the two
 * sizes stays in the view; choosing the corner is here.
 */

/** Tooltip offset from the cursor, in CSS pixels. */
export const TOOLTIP_DX = 14;
export const TOOLTIP_DY = -12;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** `value` inside `[0, max]`, with `0` winning when `max` is itself negative. */
function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * The top-left corner for a `tooltip`-sized box hovering `cursor` inside
 * `viewport`, in the viewport's own coordinates.
 *
 * Horizontally the box flips to the other side of the cursor when it would
 * overflow the right edge, rather than sliding back along it: a slid box sits
 * under the pointer and covers the event it is describing. Vertically it
 * slides, because `TOOLTIP_DY` is small enough that a flip would barely move
 * it — the top edge is reachable from any cursor within 12px of it, and the
 * bottom edge from a tall bin tooltip anywhere near the foot of the canvas.
 *
 * Both axes clamp last, which is what keeps a box wider than its viewport on
 * screen at all.
 */
export function placeTooltip(
  cursor: Point,
  tooltip: Size,
  viewport: Size,
): Point {
  const right = cursor.x + TOOLTIP_DX;
  const overflows = right + tooltip.width > viewport.width;
  const x = overflows ? cursor.x - TOOLTIP_DX - tooltip.width : right;

  return {
    x: clamp(x, viewport.width - tooltip.width),
    y: clamp(cursor.y + TOOLTIP_DY, viewport.height - tooltip.height),
  };
}
