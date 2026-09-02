/**
 * The wired half of the tooltip clamp (#55): `placeTooltip` is pinned as
 * arithmetic in `tooltipPlacement.test.ts`, and what is left is whether the
 * two boxes it is given are measured correctly at the moment they are read.
 * That only fails in a real layout engine, so it is asserted here, through a
 * real `mousemove` on a real canvas.
 *
 * ## What the bug actually looks like
 *
 * Not a tooltip hanging off the right edge. `.tooltip` is absolutely
 * positioned with a `max-width` and no `right`, so it shrinks to fit
 * `containing block − left`: placed 14px from the right edge it does not
 * overflow, it is *crushed* into a tall sliver against it, and `overflow:
 * hidden` on the root clips whatever is left. So the assertion is that the
 * same tooltip is the same box wherever it is shown — an unsqueezed one that
 * fits is the whole of what #55 asks for, and it is the one claim that a
 * tooltip measured in the wrong place cannot satisfy by accident.
 *
 * ## Why a stylesheet
 *
 * #48 rejected importing `main.css`, so a layout change elsewhere cannot break
 * these tests. But placement is meaningless without the declarations that make
 * the box placeable and measurable: a positioned root sized to its parent, a
 * canvas that fills it, and a `max-width` for the tooltip to shrink against.
 * Those are restated below and nothing else is. They are the contract this
 * file's logic is written against, and without them the test would be
 * measuring a static full-width block on a canvas with no box.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_COLORS } from "../theme.js";
import { createTimelineView } from "./timelineView.js";
import type { TimelineView } from "./timelineView.js";
import type { TimelineEvent } from "./types.js";
import {
  DAY,
  DOT_Y,
  HEIGHT,
  VIEW_END,
  VIEW_START,
  WIDTH,
  nextFrames,
} from "../test-support/timelineFixture.js";

/** The load-bearing subset of `main.css`; see the file comment. */
const CSS = `
  .timeline-root { position: relative; width: 100%; height: 100%; }
  .timeline-root canvas { display: block; width: 100%; height: 100%; }
  .tooltip { position: absolute; max-width: 240px; }
`;

/**
 * Four instants on the fixture's one-day-per-pixel view, so an event's start
 * in days is its x.
 *
 * `MID_X` and `EDGE_X` carry the *same* long title — long enough to reach the
 * 240px `max-width` — so the tooltip shown in open space is the reference the
 * one at the edge has to match. `SHORT_X` exists only to park the tooltip near
 * the right edge before the edge hover, which is what makes a measurement
 * taken at the previous position visibly wrong.
 */
const MID_X = 200;
const EDGE_X = 560;
const SHORT_X = 600;

const LONG_TITLE =
  "The reign of Jehoiakim son of Josiah king of Judah, and every year of it";

const events: TimelineEvent[] = [
  { id: "mid", start: MID_X * DAY, title: LONG_TITLE },
  { id: "edge", start: EDGE_X * DAY, title: LONG_TITLE },
  { id: "short", start: SHORT_X * DAY, title: "Ahab" },
];

describe("createTimelineView tooltip placement", () => {
  let parent: HTMLDivElement;
  let style: HTMLStyleElement;
  let view: TimelineView;
  let canvas: HTMLCanvasElement;
  let tooltip: HTMLElement;

  /** Hover the canvas at view coordinates, as a real pointer would. */
  function hover(x: number, y: number): void {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true,
      }),
    );
  }

  /** The tooltip's laid-out box, in the root's coordinates. */
  function box() {
    return {
      left: tooltip.offsetLeft,
      top: tooltip.offsetTop,
      width: tooltip.offsetWidth,
      height: tooltip.offsetHeight,
    };
  }

  beforeEach(async () => {
    style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);

    parent = document.createElement("div");
    // The view is sized by its box and nothing else: `main.css` is not loaded,
    // so without these the canvas lays out at zero and every hover misses.
    parent.style.width = `${WIDTH}px`;
    parent.style.height = `${HEIGHT}px`;
    document.body.append(parent);

    view = await createTimelineView(parent, {
      initialViewStart: VIEW_START,
      initialViewEnd: VIEW_END,
      colors: THEME_COLORS.light,
      dataset: events,
      onSelectionChange: () => {},
    });
    // The only way in is the `ResizeObserver` on the root, which delivers on a
    // later frame than the one that appended it.
    await nextFrames();

    canvas = parent.querySelector("canvas")!;
    tooltip = parent.querySelector(".tooltip")!;
  });

  afterEach(() => {
    view.destroy();
    parent.remove();
    style.remove();
  });

  /**
   * The guard on everything below. A view that never got a box hit-tests
   * nothing, and a suite of hovers that show no tooltip is green and worthless.
   */
  it("is hovering a laid-out view that hit-tests", () => {
    expect(canvas.clientWidth).toBe(WIDTH);
    hover(MID_X, DOT_Y);
    expect(tooltip.style.display).not.toBe("none");
    expect(tooltip.textContent).toContain("Jehoiakim");
  });

  it("shows the same box at the right edge as in open space", () => {
    hover(MID_X, DOT_Y);
    const reference = box();
    // Guard the reference itself: a tooltip that never reached its max-width
    // has nothing left to be squeezed out of it, and the comparison below
    // would hold for both the clamped and the unclamped view.
    expect(reference.width).toBe(240);

    hover(EDGE_X, DOT_Y);
    const atEdge = box();
    expect(atEdge.width).toBe(reference.width);
    expect(atEdge.height).toBe(reference.height);
    expect(atEdge.left).toBeGreaterThanOrEqual(0);
    expect(atEdge.left + atEdge.width).toBeLessThanOrEqual(WIDTH);
  });

  /**
   * The regression the measurement order exists for. The tooltip is measured
   * where it currently sits, so hovering `short` first parks it at x≈614 and
   * the wide tooltip that follows is measured against the 186px of room left
   * *there* — reporting a narrow, tall box, which is then placed as if it fit.
   * Hovering `edge` on its own does not catch this; the previous hover is the
   * whole test.
   */
  it("measures the tooltip independently of where the last one sat", () => {
    hover(MID_X, DOT_Y);
    const reference = box();

    hover(SHORT_X, DOT_Y);
    expect(tooltip.textContent).toContain("Ahab");
    expect(tooltip.offsetLeft).toBeGreaterThan(EDGE_X);

    hover(EDGE_X, DOT_Y);
    expect(tooltip.textContent).toContain("Jehoiakim");
    // Size only: the reference sits where the cursor was, and the point here
    // is the box, not the corner.
    expect(box().width).toBe(reference.width);
    expect(box().height).toBe(reference.height);
  });
});
