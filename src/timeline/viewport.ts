import type { Time, TimelineEvent } from "./types.js";

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
 * The category an event without one is counted under.
 *
 * Deliberately not a key in `CATEGORY_COLORS`, so a bin dominated by
 * uncategorised events falls through to `DEFAULT_CATEGORY_COLOR` — see
 * `viewport.test.ts`, which asserts that.
 */
export const UNCATEGORIZED = "Uncategorized";

/** What one column of a `BinGrid` contains, once the events are counted. */
export interface BinTally {
  count: number;
  /** Events per category, keyed by `category ?? UNCATEGORIZED`. */
  votes: Record<string, number>;
  /**
   * The earliest and latest start time counted into this column. Both are
   * meaningless when `count` is 0, and equal when every event in the column
   * shares a start — the case a caller drilling into the column has to fall
   * back from, since there is then no extent to zoom to.
   */
  firstStart: Time;
  lastStart: Time;
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

  /**
   * Count `events` into the columns, one entry per column.
   *
   * This used to be two hand-maintained loops — one in the renderer, one in the
   * hit-test — walking the same events under the same rules, and they had
   * already drifted on the category key. One traversal is what actually makes
   * the agreement above structural rather than a promise.
   *
   * Events are assigned by start time, so an interval is counted where it
   * begins even when it stretches across half the grid; an interval that begins
   * off the left edge clamps into column 0, which is where it is drawn. Expects
   * `events` sorted by start, and stops at the first one past the right edge.
   */
  tally(events: readonly TimelineEvent[]): BinTally[] {
    const bins: BinTally[] = Array.from({ length: this.count }, () => ({
      count: 0,
      votes: {},
      firstStart: Infinity,
      lastStart: -Infinity,
    }));

    for (const event of events) {
      if (event.start > this.view.end) break;
      if ((event.end ?? event.start) < this.view.start) continue;

      const bin = bins[this.indexAt(event.start)];
      bin.count += 1;
      if (event.start < bin.firstStart) bin.firstStart = event.start;
      if (event.start > bin.lastStart) bin.lastStart = event.start;
      const category = event.category ?? UNCATEGORIZED;
      bin.votes[category] = (bin.votes[category] ?? 0) + 1;
    }

    return bins;
  }

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
