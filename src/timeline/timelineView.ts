/**
 * The DOM half of the timeline: canvas host, gap indicators and hover tooltips.
 * Replaces `Timeline.svelte`.
 *
 * Everything here is built once and mutated in place. Gap indicators and the
 * tooltip move on every frame, so re-creating nodes (or re-serialising HTML)
 * would allocate on the hot path; the pools below reuse nodes and only touch a
 * style property when its value actually changes.
 *
 * `TimelineController` owns all render state and is not modified by this file.
 */

import { TimelineController } from "./TimelineController.js";
import type {
  TimelineControllerOptions,
  BinInfo,
  GapInfo,
} from "./TimelineController.js";
import type { TimelineColors } from "../theme.js";
import type { TimelineEvent } from "./types.js";
import { formatYear } from "../format.js";
import { placeTooltip } from "./tooltipPlacement.js";

/** A gap narrower than this gets a connector line but no year label. */
const GAP_LABEL_MIN_WIDTH = 48;

export interface TimelineViewOptions {
  initialViewStart: number;
  initialViewEnd: number;
  colors: TimelineColors;
  dataset: TimelineEvent[];
  onSelectionChange: NonNullable<
    TimelineControllerOptions["onSelectionChange"]
  >;
}

export interface TimelineView {
  setColors(colors: TimelineColors): void;
  resetView(): void;
  zoomToSelection(): void;
  destroy(): void;
}

/** Assign only when changed — these run every frame for every gap. */
function setStyle(
  el: HTMLElement,
  prop: "left" | "top" | "width",
  value: string,
) {
  if (el.style[prop] !== value) el.style[prop] = value;
}

/** Grows on demand and hides the tail; nodes are never removed. */
class NodePool<T extends HTMLElement> {
  private readonly nodes: T[] = [];
  private used = 0;

  constructor(
    private readonly parent: HTMLElement,
    private readonly make: () => T,
  ) {}

  /** Take the next free node, creating one if the pool is exhausted. */
  next(): T {
    let node = this.nodes[this.used];
    if (!node) {
      node = this.make();
      this.nodes.push(node);
      this.parent.append(node);
    }
    node.style.display = "";
    this.used += 1;
    return node;
  }

  /** Hide everything past what `next()` handed out this frame. */
  release(): void {
    for (let i = this.used; i < this.nodes.length; i += 1) {
      const node = this.nodes[i];
      if (node && node.style.display !== "none") node.style.display = "none";
    }
    this.used = 0;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export async function createTimelineView(
  parent: HTMLElement,
  options: TimelineViewOptions,
): Promise<TimelineView> {
  const root = el("div", "timeline-root");
  const canvas = document.createElement("canvas");
  root.append(canvas);
  parent.append(root);

  const gapLines = new NodePool(root, () => el("div", "gap-line"));
  const gapLabels = new NodePool(root, () => el("span", "gap-label"));

  const tooltip = el("div", "tooltip");
  tooltip.style.display = "none";
  root.append(tooltip);

  // Identity of whatever the tooltip currently describes. While it is
  // unchanged the tooltip only moves; its contents are left alone.
  let tooltipKey: string | null = null;

  // The box the tooltip is being kept inside, and the box it is. Both are read
  // from layout, which is why neither is read on the move path: the viewport
  // comes from the `ResizeObserver` below, and the tooltip is measured once per
  // content change, since only its content can resize it.
  let viewportSize = { width: root.clientWidth, height: root.clientHeight };
  let tooltipSize = { width: 0, height: 0 };

  function hideTooltip(): void {
    if (tooltipKey === null) return;
    tooltipKey = null;
    tooltip.style.display = "none";
    tooltip.replaceChildren();
  }

  function showTooltip(key: string, x: number, y: number, build: () => Node[]) {
    if (key !== tooltipKey) {
      tooltipKey = key;
      tooltip.replaceChildren(...build());
      tooltip.style.display = "";
      // After the display flip, or the box measures zero while hidden.
      tooltipSize = {
        width: tooltip.offsetWidth,
        height: tooltip.offsetHeight,
      };
    }
    const at = placeTooltip({ x, y }, tooltipSize, viewportSize);
    setStyle(tooltip, "left", `${at.x}px`);
    setStyle(tooltip, "top", `${at.y}px`);
  }

  function line(className: string, text: string): HTMLDivElement {
    const node = el("div", className);
    node.textContent = text;
    return node;
  }

  function eventTooltip(event: TimelineEvent): Node[] {
    const nodes: Node[] = [line("tooltip-title", event.title)];
    const reference = event.meta?.["reference"];
    if (reference != null) nodes.push(line("tooltip-ref", String(reference)));
    return nodes;
  }

  function binTooltip(bin: BinInfo): Node[] {
    const nodes: Node[] = [
      line("tooltip-title", `${bin.count} event${bin.count === 1 ? "" : "s"}`),
      line(
        "tooltip-range",
        `${formatYear(bin.timeStart)} – ${formatYear(bin.timeEnd)}`,
      ),
    ];
    for (const cat of bin.categories.slice(0, 3)) {
      const row = el("div", "tooltip-cat");
      const name = el("span", "tooltip-cat-name");
      name.textContent = cat.name || "Uncategorized";
      const count = el("span", "tooltip-cat-count");
      count.textContent = String(cat.count);
      row.append(name, count);
      nodes.push(row);
    }
    nodes.push(
      line("tooltip-hint", "Click to select · Zoom to Selection to drill in"),
    );
    return nodes;
  }

  // ─── Controller ────────────────────────────────────────────────────────────

  const ctrl = await TimelineController.create(canvas, {
    initialViewStart: options.initialViewStart,
    initialViewEnd: options.initialViewEnd,
    colors: options.colors,
    onSelectionChange: options.onSelectionChange,
  });
  ctrl.setDataset(options.dataset);

  // ─── Hover ─────────────────────────────────────────────────────────────────

  function onMouseMove(e: MouseEvent): void {
    if (ctrl.lod === "A") {
      const bin = ctrl.getBinAt(e.offsetX, e.offsetY);
      if (!bin) return hideTooltip();
      showTooltip(
        `bin:${bin.timeStart}:${bin.timeEnd}:${bin.count}`,
        e.offsetX,
        e.offsetY,
        () => binTooltip(bin),
      );
    } else {
      const event = ctrl.getEventAt(e.offsetX, e.offsetY);
      if (!event) return hideTooltip();
      showTooltip(`event:${event.id}`, e.offsetX, e.offsetY, () =>
        eventTooltip(event),
      );
    }
  }

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", hideTooltip);

  // ─── Resize ────────────────────────────────────────────────────────────────

  const ro = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) return;
    viewportSize = { width, height };
    ctrl.resize(width, height);
  });
  ro.observe(root);

  // ─── Gap indicators ────────────────────────────────────────────────────────
  //
  // Gaps shift on every pan and zoom, so they are re-read once per frame. The
  // read is driven by the controller's own ticker via `onFrame`, not a second
  // `requestAnimationFrame` loop, so these DOM nodes and the canvas beneath
  // them always show the same view state.

  function paintGaps(gaps: GapInfo[]): void {
    for (const gap of gaps) {
      const width = gap.x2 - gap.x1;
      const lineEl = gapLines.next();
      setStyle(lineEl, "left", `${gap.x1}px`);
      setStyle(lineEl, "width", `${width}px`);
      setStyle(lineEl, "top", `${gap.y}px`);

      if (width > GAP_LABEL_MIN_WIDTH) {
        const labelEl = gapLabels.next();
        setStyle(labelEl, "left", `${(gap.x1 + gap.x2) / 2}px`);
        setStyle(labelEl, "top", `${gap.y}px`);
        if (labelEl.textContent !== gap.label) labelEl.textContent = gap.label;
      }
    }
    gapLines.release();
    gapLabels.release();
  }

  const stopPainting = ctrl.onFrame(() => paintGaps(ctrl.getGaps()));

  return {
    setColors: (colors) => ctrl.setColors(colors),
    resetView: () => ctrl.resetView(),
    zoomToSelection: () => ctrl.zoomToSelection(),
    destroy() {
      stopPainting();
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", hideTooltip);
      ctrl.destroy();
      root.remove();
    },
  };
}
