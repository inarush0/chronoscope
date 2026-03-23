import { Application, Graphics } from "pixi.js";
import { scaleTime } from "d3-scale";
import type { Time, TimelineEvent, TickMark, ViewState } from "./types.js";

// ─── Layout constants ───────────────────────────────────────────────────────

const SPINE_Y_FRACTION = 2 / 3; // spine line sits 2/3 down the canvas
const MIN_CLICK_MOVEMENT = 4; // px — below this, pointerdown+up is a click
const ZOOM_FACTOR = 1.12; // per wheel tick

// ─── Event rendering constants ───────────────────────────────────────────────

const DOT_STEM = 18;    // px — spine → instant dot
const BAR_BOTTOM = 34;  // px — spine → bottom of interval bar (clears the dots)
const BAR_HEIGHT = 8;   // px — height of interval bars
const DOT_RADIUS = 3;   // px — instant event dot radius
const MIN_BAR_WIDTH = 3; // px — minimum rendered width for interval bars

const CATEGORY_COLORS: Record<string, number> = {
  "Primeval History": 0x6666cc,
  Abraham: 0xc8882a,
  Jacob: 0x3d8c3d,
  Joseph: 0xcc5533,
};
const DEFAULT_EVENT_COLOR = 0x7777aa;

// ─── Public data shapes ───────────────────────────────────────────────────────

export interface GapInfo {
  x1: number;    // left endpoint pixel
  x2: number;    // right endpoint pixel
  y: number;     // y position (below spine)
  label: string; // e.g. "430 yrs"
}

export interface BinInfo {
  /** Theoretical time range of the bin column. */
  timeStart: Time;
  timeEnd: Time;
  /** Actual extent of events assigned to this bin (used for zooming). */
  eventStart: Time;
  eventEnd: Time;
  count: number;
  /** Sorted descending by count. */
  categories: { name: string; count: number }[];
}

// ─── Gap indicator constants ──────────────────────────────────────────────────

/** px below spine where the gap connector line sits. */
const GAP_LINE_OFFSET = 20;
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// ─── LOD constants ────────────────────────────────────────────────────────────

/** Switch to density-bin view when average px/event falls below this. */
const LOD_THRESHOLD = 40; // px per event
/** Width of each density bin in LOD A. */
const LOD_BIN_WIDTH = 24; // px
/** Max bar height for a density bin (in px, measured from spine upward). */
const LOD_MAX_BAR_HEIGHT = 60; // px

// ─── Theme colors ────────────────────────────────────────────────────────────

export interface TimelineColors {
  background: number;
  spine: number;
}

export const THEME_COLORS = {
  light: { background: 0xf5f5f5, spine: 0x7777bb },
  dark: { background: 0x13131f, spine: 0x5555aa },
} satisfies Record<string, TimelineColors>;

// ─── Public options ──────────────────────────────────────────────────────────

export interface TimelineControllerOptions {
  initialViewStart: Time;
  initialViewEnd: Time;
  colors?: TimelineColors;
  onSelectionChange?: (id: string | null) => void;
}

// ─── Controller ──────────────────────────────────────────────────────────────

export class TimelineController {
  private readonly app: Application;

  // --- Render state (owned here, never in Svelte) ---
  private _viewStart: Time;
  private _viewEnd: Time;

  // --- Interaction state ---
  private isPanning = false;
  private panOriginX = 0;
  private panOriginStart: Time = 0;
  private panOriginEnd: Time = 0;

  // --- Selection ---
  private selectedId: string | null = null;
  private selectedBinRange: { start: Time; end: Time } | null = null;

  // --- Theme ---
  private colors: TimelineColors;

  // --- Pixi layers ---
  private readonly bgLayer: Graphics;
  private readonly eventLayer: Graphics;

  // --- Dataset ---
  private events: TimelineEvent[] = [];

  // --- Default view (for reset) ---
  private readonly defaultViewStart: Time;
  private readonly defaultViewEnd: Time;

  // --- App-level callbacks (bridge to Svelte) ---
  private readonly onSelectionChange: (id: string | null) => void;

  // ─── Private constructor — use TimelineController.create() ─────────────────

  private constructor(
    app: Application,
    options: TimelineControllerOptions,
    bgLayer: Graphics,
    eventLayer: Graphics,
  ) {
    this.app = app;

    this._viewStart = options.initialViewStart;
    this._viewEnd = options.initialViewEnd;
    this.defaultViewStart = options.initialViewStart;
    this.defaultViewEnd = options.initialViewEnd;

    this.colors = options.colors ?? THEME_COLORS.light;
    this.onSelectionChange = options.onSelectionChange ?? (() => {});

    this.bgLayer = bgLayer;
    this.eventLayer = eventLayer;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  static async create(
    canvas: HTMLCanvasElement,
    options: TimelineControllerOptions,
  ): Promise<TimelineController> {
    const app = new Application();
    const initialColors = options.colors ?? THEME_COLORS.light;
    await app.init({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      backgroundColor: initialColors.background,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    const bgLayer = new Graphics();
    const eventLayer = new Graphics();
    app.stage.addChild(bgLayer, eventLayer);

    const ctrl = new TimelineController(app, options, bgLayer, eventLayer);
    ctrl.setupInteraction(canvas);
    app.ticker.add(ctrl.render);
    return ctrl;
  }

  // ─── Coordinate transforms ─────────────────────────────────────────────────

  private get viewWidth(): number {
    return this.app.screen.width;
  }
  private get viewHeight(): number {
    return this.app.screen.height;
  }

  timeToPixel(time: Time): number {
    return (
      ((time - this._viewStart) / (this._viewEnd - this._viewStart)) *
      this.viewWidth
    );
  }

  pixelToTime(px: number): number {
    return (
      this._viewStart +
      (px / this.viewWidth) * (this._viewEnd - this._viewStart)
    );
  }

  // ─── View manipulation ─────────────────────────────────────────────────────

  zoom(factor: number, cursorX: number): void {
    const tCursor = this.pixelToTime(cursorX);
    const span = this._viewEnd - this._viewStart;
    const newSpan = span / factor;
    const fraction = cursorX / this.viewWidth;
    this._viewStart = tCursor - newSpan * fraction;
    this._viewEnd = tCursor + newSpan * (1 - fraction);
  }

  pan(dx: number): void {
    const dt = (dx / this.viewWidth) * (this._viewEnd - this._viewStart);
    this._viewStart -= dt;
    this._viewEnd -= dt;
  }

  resetView(): void {
    this._viewStart = this.defaultViewStart;
    this._viewEnd = this.defaultViewEnd;
  }

  zoomToSelection(): void {
    if (this.selectedId) {
      const event = this.events.find((e) => e.id === this.selectedId);
      if (!event) return;
      const end = event.end ?? event.start;
      const eventSpan = Math.max(end - event.start, 1);
      const padding = Math.max(
        eventSpan * 0.5,
        (this._viewEnd - this._viewStart) * 0.05,
      );
      this._viewStart = event.start - padding;
      this._viewEnd = end + padding;
    } else if (this.selectedBinRange) {
      const span = Math.max(this.selectedBinRange.end - this.selectedBinRange.start, 1);
      const padding = span * 0.2;
      this._viewStart = this.selectedBinRange.start - padding;
      this._viewEnd = this.selectedBinRange.end + padding;
    }
  }

  // ─── Dataset ───────────────────────────────────────────────────────────────

  setDataset(events: TimelineEvent[]): void {
    this.events = [...events].sort((a, b) => a.start - b.start);
  }

  // ─── Theme ─────────────────────────────────────────────────────────────────

  setColors(colors: TimelineColors): void {
    this.colors = colors;
    this.app.renderer.background.color = colors.background;
  }

  // ─── Selection ─────────────────────────────────────────────────────────────

  selectEvent(id: string | null): void {
    this.selectedId = id;
    this.selectedBinRange = null;
    this.onSelectionChange(id);
  }

  // ─── State queries for Svelte overlay ──────────────────────────────────────

  getTicks(): TickMark[] {
    const scale = scaleTime()
      .domain([new Date(this._viewStart), new Date(this._viewEnd)])
      .range([0, this.viewWidth]);

    const tickCount = Math.max(2, Math.floor(this.viewWidth / 80));
    return scale.ticks(tickCount).map((date) => ({
      time: date.getTime(),
      x: this.timeToPixel(date.getTime()),
      label: this.formatTickLabel(date),
    }));
  }

  getViewState(): ViewState {
    return {
      viewStart: this._viewStart,
      viewEnd: this._viewEnd,
    };
  }

  /** Y pixel position of the spine line. */
  getSpineY(): number {
    return this.viewHeight * SPINE_Y_FRACTION;
  }

  /** 'A' = density-bin view (zoomed out), 'B' = individual event view. */
  get lod(): "A" | "B" {
    const visibleCount = this.events.filter((e) => {
      const end = e.end ?? e.start;
      return end >= this._viewStart && e.start <= this._viewEnd;
    }).length;
    if (visibleCount === 0) return "B";
    const pxPerEvent = this.viewWidth / visibleCount;
    return pxPerEvent < LOD_THRESHOLD ? "A" : "B";
  }

  /**
   * Hit-test (x, y) in CSS pixels against rendered events.
   * Returns null when in LOD A (density-bin) mode.
   * Returns the first matching event, or null.
   */
  getEventAt(x: number, y: number): TimelineEvent | null {
    if (this.lod === "A") return null;

    const spineY = this.viewHeight * SPINE_Y_FRACTION;
    const dotY = spineY - DOT_STEM;
    const barBotY = spineY - BAR_BOTTOM;
    const barTopY = barBotY - BAR_HEIGHT;
    const HIT = 8;

    if (y > spineY + HIT || y < barTopY - HIT) return null;

    // Pass 1: instant events — smaller targets, always take priority.
    for (const event of this.events) {
      if (event.end != null) continue;
      if (event.start < this._viewStart || event.start > this._viewEnd) continue;
      const x1 = this.timeToPixel(event.start);
      // Hit the stem or the dot.
      if (Math.abs(x - x1) <= HIT && y >= dotY - HIT && y <= spineY) {
        return event;
      }
    }

    // Pass 2: interval events — bar region or stems.
    for (const event of this.events) {
      if (event.end == null) continue;
      const eventEnd = event.end;
      if (eventEnd < this._viewStart || event.start > this._viewEnd) continue;
      const x1 = this.timeToPixel(event.start);
      const x2 = this.timeToPixel(eventEnd);
      // Hit the bar.
      if (x >= x1 - HIT && x <= x2 + HIT && y >= barTopY - HIT && y <= barBotY + HIT) {
        return event;
      }
      // Hit either stem.
      if (y >= spineY - HIT && y <= barBotY + HIT) {
        if (Math.abs(x - x1) <= HIT || Math.abs(x - x2) <= HIT) return event;
      }
    }

    return null;
  }

  /**
   * Returns bin info for the density bar under (x, y) when in LOD A.
   * Returns null when in LOD B or if no bar is present at (x, y).
   */
  getBinAt(x: number, y: number): BinInfo | null {
    if (this.lod !== "A") return null;

    const w = this.viewWidth;
    const h = this.viewHeight;
    const spineY = h * SPINE_Y_FRACTION;

    // Respond anywhere above (and just below) the spine in the canvas.
    if (y > spineY + 8 || y < 0) return null;

    const numBins = Math.max(1, Math.floor(w / LOD_BIN_WIDTH));
    const binIdx = Math.floor(x / LOD_BIN_WIDTH);
    if (binIdx < 0 || binIdx >= numBins) return null;

    const timePerBin = (this._viewEnd - this._viewStart) / numBins;
    const binStart = this._viewStart + binIdx * timePerBin;
    const binEnd = binStart + timePerBin;

    // Count events assigned to this bin (same assignment logic as renderLODA).
    const votes: Record<string, number> = {};
    let count = 0;
    let eventStart = Infinity;
    let eventEnd = -Infinity;
    for (const event of this.events) {
      if (event.start > this._viewEnd) break;
      const end = event.end ?? event.start;
      if (end < this._viewStart) continue;
      const fraction =
        (event.start - this._viewStart) / (this._viewEnd - this._viewStart);
      const idx = Math.min(
        numBins - 1,
        Math.max(0, Math.floor(fraction * numBins)),
      );
      if (idx === binIdx) {
        count++;
        if (event.start < eventStart) eventStart = event.start;
        if (end > eventEnd) eventEnd = end;
        const cat = event.category ?? "Uncategorized";
        votes[cat] = (votes[cat] ?? 0) + 1;
      }
    }

    if (count === 0) return null;

    const categories = Object.entries(votes)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { timeStart: binStart, timeEnd: binEnd, eventStart, eventEnd, count, categories };
  }

  /**
   * Returns gap indicators between consecutive events (LOD B only).
   * Each entry gives the pixel endpoints and a formatted year label.
   */
  getGaps(): GapInfo[] {
    if (this.lod !== "B") return [];

    const w = this.viewWidth;
    const y = this.viewHeight * SPINE_Y_FRACTION + GAP_LINE_OFFSET;
    const gaps: GapInfo[] = [];

    for (let i = 0; i < this.events.length - 1; i++) {
      const a = this.events[i];
      const b = this.events[i + 1];

      const x1 = this.timeToPixel(a.start);
      if (x1 > w) break; // events sorted; everything after is also off screen

      const x2 = this.timeToPixel(b.start);
      if (x2 < 0 || x2 <= x1) continue;

      const years = Math.round((b.start - a.start) / MS_PER_YEAR);
      const label =
        years === 0 ? "<1 yr"
        : years === 1 ? "1 yr"
        : `${years.toLocaleString()} yrs`;

      gaps.push({ x1, x2, y, label });
    }

    return gaps;
  }

  // ─── Tick label formatting ──────────────────────────────────────────────────

  private formatTickLabel(date: Date): string {
    const span = this._viewEnd - this._viewStart;
    const MS = { sec: 1_000, min: 60_000, hour: 3_600_000, day: 86_400_000 };

    if (span > 365 * MS.day) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
      });
    }
    if (span > 30 * MS.day) {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    if (span > MS.day) {
      return (
        date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    if (span > MS.hour) {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (span > MS.min) {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    return (
      date.toLocaleTimeString(undefined, {
        minute: "2-digit",
        second: "2-digit",
      }) +
      "." +
      String(date.getMilliseconds()).padStart(3, "0")
    );
  }

  // ─── Render loop ───────────────────────────────────────────────────────────

  private render = (): void => {
    this.renderBackground();
    if (this.lod === "A") {
      this.renderLODA();
    } else {
      this.renderLODB();
    }
  };

  private renderBackground(): void {
    const g = this.bgLayer;
    g.clear();

    const w = this.viewWidth;
    const h = this.viewHeight;
    const spineY = Math.round(h * SPINE_Y_FRACTION);

    // Background fill
    g.rect(0, 0, w, h).fill(this.colors.background);

    // Spine line
    g.moveTo(0, spineY).lineTo(w, spineY);
    g.stroke({ color: this.colors.spine, width: 1 });
  }

  /** LOD A: density-bin histogram. Each bin shows event count as a bar. */
  private renderLODA(): void {
    const g = this.eventLayer;
    g.clear();

    const w = this.viewWidth;
    const h = this.viewHeight;
    const spineY = h * SPINE_Y_FRACTION;
    const numBins = Math.max(1, Math.floor(w / LOD_BIN_WIDTH));

    // Accumulate event count + category votes per bin.
    type Bin = { count: number; votes: Record<string, number> };
    const bins: Bin[] = Array.from({ length: numBins }, () => ({
      count: 0,
      votes: {},
    }));

    for (const event of this.events) {
      // Use start time to assign to a bin.
      if (event.start > this._viewEnd) break; // sorted, so safe to break
      const end = event.end ?? event.start;
      if (end < this._viewStart) continue;

      const fraction =
        (event.start - this._viewStart) / (this._viewEnd - this._viewStart);
      const binIdx = Math.min(numBins - 1, Math.max(0, Math.floor(fraction * numBins)));
      bins[binIdx].count++;
      const cat = event.category ?? "";
      bins[binIdx].votes[cat] = (bins[binIdx].votes[cat] ?? 0) + 1;
    }

    const maxCount = Math.max(1, ...bins.map((b) => b.count));

    // Determine which bin index corresponds to the selected bin range.
    let selectedBinIdx = -1;
    if (this.selectedBinRange) {
      const fraction =
        (this.selectedBinRange.start - this._viewStart) /
        (this._viewEnd - this._viewStart);
      selectedBinIdx = Math.min(
        numBins - 1,
        Math.max(0, Math.floor(fraction * numBins)),
      );
    }

    for (let i = 0; i < numBins; i++) {
      const bin = bins[i];
      if (bin.count === 0) continue;

      // Dominant category color.
      let dominantCat = "";
      let maxVotes = 0;
      for (const [cat, votes] of Object.entries(bin.votes)) {
        if (votes > maxVotes) { maxVotes = votes; dominantCat = cat; }
      }
      const color = CATEGORY_COLORS[dominantCat] ?? DEFAULT_EVENT_COLOR;
      const isSelected = i === selectedBinIdx;

      const barH = Math.max(2, (bin.count / maxCount) * LOD_MAX_BAR_HEIGHT);
      const x = i * LOD_BIN_WIDTH;
      g.rect(x + 1, spineY - barH, LOD_BIN_WIDTH - 2, barH).fill({
        color,
        alpha: isSelected ? 1.0 : 0.75,
      });
      if (isSelected) {
        g.rect(x + 1, spineY - barH, LOD_BIN_WIDTH - 2, barH);
        g.stroke({ color: 0xffffff, width: 1.5 });
      }
    }
  }

  /** LOD B: individual event rendering — interval bars + instant dots. */
  private renderLODB(): void {
    const g = this.eventLayer;
    g.clear();

    const w = this.viewWidth;
    const h = this.viewHeight;
    const spineY = h * SPINE_Y_FRACTION;
    const dotY = spineY - DOT_STEM;           // instant dot sits here
    const barBotY = spineY - BAR_BOTTOM;      // bottom edge of interval bar
    const barTopY = barBotY - BAR_HEIGHT;     // top edge of interval bar

    // ── Pass 1: interval bars (drawn first, underneath dots) ─────────────────
    for (const event of this.events) {
      if (event.end == null) continue;

      const eventEnd = event.end;
      if (eventEnd < this._viewStart || event.start > this._viewEnd) continue;

      const color = CATEGORY_COLORS[event.category ?? ""] ?? DEFAULT_EVENT_COLOR;
      const isSelected = event.id === this.selectedId;
      const alpha = isSelected ? 1 : 0.8;

      const x1 = this.timeToPixel(event.start);
      const x2 = this.timeToPixel(eventEnd);
      const barW = Math.max(x2 - x1, MIN_BAR_WIDTH);

      const drawX = Math.max(0, x1);
      const drawW = Math.min(w, x1 + barW) - drawX;
      if (drawW <= 0) continue;

      // Stems from spine up to bar bottom.
      if (x1 >= 0 && x1 <= w) {
        g.moveTo(x1, spineY).lineTo(x1, barBotY);
      }
      if (x2 >= 0 && x2 <= w && barW > MIN_BAR_WIDTH) {
        g.moveTo(x2, spineY).lineTo(x2, barBotY);
      }
      g.stroke({ color, width: 1, alpha });

      g.rect(drawX, barTopY, drawW, BAR_HEIGHT).fill({ color, alpha });

      if (isSelected) {
        g.rect(drawX - 1, barTopY - 1, drawW + 2, BAR_HEIGHT + 2);
        g.stroke({ color: 0xffffff, width: 1.5 });
      }
    }

    // ── Pass 2: instant dots (drawn on top so they're never obscured) ────────
    for (const event of this.events) {
      if (event.end != null) continue;
      if (event.start < this._viewStart || event.start > this._viewEnd) continue;

      const x1 = this.timeToPixel(event.start);
      if (x1 < -DOT_RADIUS || x1 > w + DOT_RADIUS) continue;

      const color = CATEGORY_COLORS[event.category ?? ""] ?? DEFAULT_EVENT_COLOR;
      const isSelected = event.id === this.selectedId;
      const alpha = isSelected ? 1 : 0.8;

      g.moveTo(x1, spineY).lineTo(x1, dotY);
      g.stroke({ color, width: 1, alpha });

      g.circle(x1, dotY, DOT_RADIUS).fill({ color, alpha });

      if (isSelected) {
        g.circle(x1, dotY, DOT_RADIUS + 2);
        g.stroke({ color: 0xffffff, width: 1.5 });
      }
    }
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  private setupInteraction(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.onDblClick);
  }

  private onPointerDown = (e: PointerEvent): void => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    this.isPanning = true;
    this.panOriginX = e.offsetX;
    this.panOriginStart = this._viewStart;
    this.panOriginEnd = this._viewEnd;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isPanning) {
      const dx = e.offsetX - this.panOriginX;
      const span = this.panOriginEnd - this.panOriginStart;
      const dt = -(dx / this.viewWidth) * span;
      this._viewStart = this.panOriginStart + dt;
      this._viewEnd = this.panOriginEnd + dt;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const totalMove = Math.abs(e.offsetX - this.panOriginX);

    if (this.isPanning && totalMove < MIN_CLICK_MOVEMENT) {
      this.handleClick(e.offsetX, e.offsetY);
    }

    this.isPanning = false;
    canvas.style.cursor = "";
  };

  private onPointerLeave = (): void => {
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    this.zoom(factor, e.offsetX);
  };

  private onDblClick = (e: MouseEvent): void => {
    if (this.lod !== "A") return;
    const bin = this.getBinAt(e.offsetX, e.offsetY);
    if (!bin) return;
    this.selectedBinRange = { start: bin.eventStart, end: bin.eventEnd };
    this.selectedId = null;
    this.onSelectionChange(null);
    this.zoomToSelection();
  };

  private handleClick(x: number, y: number): void {
    if (this.lod === "A") {
      const bin = this.getBinAt(x, y);
      this.selectedBinRange = bin
        ? { start: bin.eventStart, end: bin.eventEnd }
        : null;
      this.selectedId = null;
      this.onSelectionChange(null);
      return;
    }
    const event = this.getEventAt(x, y);
    this.selectEvent(event?.id ?? null);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("dblclick", this.onDblClick);
    this.app.ticker.remove(this.render);
    this.app.destroy(false, { children: true });
  }
}
