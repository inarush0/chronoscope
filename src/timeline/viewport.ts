import type { Time } from "./types.js";

/**
 * The window of time on screen, and every transform that follows from it.
 *
 * A `Viewport` is three numbers — the time at the left edge, the time at the
 * right edge, and the canvas width in CSS pixels — and the whole linear mapping
 * between time and pixels that those three determine. It is immutable: pans and
 * zooms return a new viewport rather than editing this one, so a caller can
 * hold the pre-gesture viewport as the origin to measure against and never
 * accumulate rounding drift across a drag.
 *
 * Nothing here touches Pixi, the DOM, or the clock, which is what makes the
 * cursor-anchored zoom invariant testable in node:
 *
 *     view.zoomAt(f, x).pixelToTime(x) === view.pixelToTime(x)
 */
export class Viewport {
  constructor(
    readonly start: Time,
    readonly end: Time,
    readonly width: number,
  ) {}

  /** Time covered by the viewport, in ms. */
  get span(): number {
    return this.end - this.start;
  }

  timeToPixel(time: Time): number {
    return ((time - this.start) / this.span) * this.width;
  }

  pixelToTime(px: number): Time {
    return this.start + (px / this.width) * this.span;
  }

  /**
   * Zoom by `factor` about `cursorX`, leaving the time under the cursor fixed.
   *
   * Solved in closed form from the cursor's fraction across the canvas rather
   * than by scaling both edges and correcting: the correction step is where an
   * anchored zoom usually drifts.
   */
  zoomAt(factor: number, cursorX: number): Viewport {
    const tCursor = this.pixelToTime(cursorX);
    const newSpan = this.span / factor;
    const fraction = cursorX / this.width;
    return new Viewport(
      tCursor - newSpan * fraction,
      tCursor + newSpan * (1 - fraction),
      this.width,
    );
  }

  /**
   * Shift the view so content follows a pointer dragged `dx` px to the right.
   *
   * Dragging right reveals earlier time, so the range moves backwards. Callers
   * pass the total offset from the gesture's origin — not a per-move delta —
   * against the viewport captured when the gesture began.
   */
  dragBy(dx: number): Viewport {
    const dt = -(dx / this.width) * this.span;
    return new Viewport(this.start + dt, this.end + dt, this.width);
  }

  /** Same canvas, different stretch of time. */
  withRange(start: Time, end: Time): Viewport {
    return new Viewport(start, end, this.width);
  }

  /** Same stretch of time, resized canvas. */
  withWidth(width: number): Viewport {
    return new Viewport(this.start, this.end, width);
  }

  /** Whether an event spanning `start`–`end` overlaps the visible window. */
  intersects(start: Time, end: Time): boolean {
    return end >= this.start && start <= this.end;
  }

  /** Divide the viewport into columns of about `binWidth` px each. */
  bins(binWidth: number): BinGrid {
    return new BinGrid(this, Math.max(1, Math.floor(this.width / binWidth)));
  }
}

/**
 * A fixed number of equal-time columns across a viewport, used by the
 * density-histogram level of detail.
 *
 * Both the renderer and the hit-test have to agree exactly on which column an
 * event lands in — a bar drawn in one column but reported by a click in its
 * neighbour is a bug you only see as a mysteriously wrong tooltip. Sharing this
 * grid is what keeps them agreeing.
 */
export class BinGrid {
  constructor(
    private readonly view: Viewport,
    readonly count: number,
  ) {}

  /** The column `time` falls in, clamped to the grid. */
  indexAt(time: Time): number {
    const fraction = (time - this.view.start) / this.view.span;
    return Math.min(
      this.count - 1,
      Math.max(0, Math.floor(fraction * this.count)),
    );
  }

  /** The time range column `index` covers. */
  rangeAt(index: number): { start: Time; end: Time } {
    const timePerBin = this.view.span / this.count;
    const start = this.view.start + index * timePerBin;
    return { start, end: start + timePerBin };
  }
}
