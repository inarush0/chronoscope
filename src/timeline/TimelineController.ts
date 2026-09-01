import { Application, Graphics } from "pixi.js";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  THEME_COLORS,
  toPixi,
} from "../theme.js";
import type { TimelineColors } from "../theme.js";
import type { Time, TimelineEvent } from "./types.js";
import { Viewport } from "./viewport.js";

// ─── Layout constants ───────────────────────────────────────────────────────

const SPINE_Y_FRACTION = 2 / 3; // spine line sits 2/3 down the canvas
const MIN_CLICK_MOVEMENT = 4; // px — below this, pointerdown+up is a click
const ZOOM_FACTOR = 1.12; // per wheel tick

// ─── Event rendering constants ───────────────────────────────────────────────

const DOT_STEM = 18; // px — spine → instant dot
const BAR_BOTTOM = 34; // px — spine → bottom of interval bar (clears the dots)
const BAR_HEIGHT = 8; // px — height of interval bars
const DOT_RADIUS = 3; // px — instant event dot radius
const MIN_BAR_WIDTH = 3; // px — minimum rendered width for interval bars

/** `src/theme.ts` authors the palette in CSS form; Pixi needs it packed. */
const CATEGORY_FILLS: Record<string, number> = Object.fromEntries(
  Object.entries(CATEGORY_COLORS).map(([name, hex]) => [name, toPixi(hex)]),
);
const DEFAULT_EVENT_COLOR = toPixi(DEFAULT_CATEGORY_COLOR);

// ─── Public data shapes ───────────────────────────────────────────────────────

export interface GapInfo {
  x1: number; // left endpoint pixel
  x2: number; // right endpoint pixel
  y: number; // y position (below spine)
  label: string; // e.g. "430 yrs"
}

export interface BinInfo {
  /** Theoretical time range of the bin column. */
  timeStart: Time;
  timeEnd: Time;
  /**
   * Range to zoom to when drilling into this bin: the extent of its events'
   * start times, which is what assigned them here. Taking the extent of their
   * end times instead stretches the view across one long interval and leaves
   * the events themselves crushed into a corner of it.
   *
   * Falls back to the column's own range when every event in the bin shares a
   * start time, since there is then no extent to zoom to.
   */
  zoomStart: Time;
  zoomEnd: Time;
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

  // --- Render state (owned here, never in the DOM layer) ---
  private _viewStart: Time;
  private _viewEnd: Time;

  // --- Interaction state ---
  private isPanning = false;
  private panOriginX = 0;
  /** Viewport as of pointerdown; every move re-drags from here, never from the
   *  previous move, so a drag cannot accumulate rounding drift. */
  private panOrigin = new Viewport(0, 0, 1);

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

  // --- LOD memo (see the `lod` getter) ---
  // NaN never equals itself, so the first read always computes.
  private lodStart = Number.NaN;
  private lodEnd = Number.NaN;
  private lodCount = -1;
  private lodWidth = -1;
  private lodValue: "A" | "B" = "B";

  // --- Per-frame subscribers ---
  private readonly frameSubscribers = new Set<() => void>();

  // --- Default view (for reset) ---
  private readonly defaultViewStart: Time;
  private readonly defaultViewEnd: Time;

  // --- App-level callbacks ---
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

  /**
   * The current view as a `Viewport`: all the time↔pixel math lives there.
   *
   * Built on read rather than stored so Pixi's screen stays the single source
   * of the canvas width — a cached copy would need invalidating on every
   * resize, and a stale one silently skews every transform. Methods that use it
   * more than once hoist it into a local, as they already do for `w` and `h`.
   */
  private get view(): Viewport {
    return new Viewport(this._viewStart, this._viewEnd, this.viewWidth);
  }

  private setView(view: Viewport): void {
    this._viewStart = view.start;
    this._viewEnd = view.end;
  }

  private get viewWidth(): number {
    return this.app.screen.width;
  }
  private get viewHeight(): number {
    return this.app.screen.height;
  }

  private timeToPixel(time: Time): number {
    return this.view.timeToPixel(time);
  }

  // ─── View manipulation ─────────────────────────────────────────────────────

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
      const span = Math.max(
        this.selectedBinRange.end - this.selectedBinRange.start,
        1,
      );
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

  private selectEvent(id: string | null): void {
    this.selectedId = id;
    this.selectedBinRange = null;
    this.onSelectionChange(id);
  }

  // ─── State queries for the DOM overlay ─────────────────────────────────────

  /**
   * 'A' = density-bin view (zoomed out), 'B' = individual event view.
   *
   * Counting visible events is an O(n) scan, and this is read several times per
   * frame — once by `render`, again by `getGaps`, and twice more per pointer
   * move via `getEventAt`/`getBinAt`. The result is a pure function of the
   * inputs memoised below, so the cache is exact rather than per-frame: a
   * pointer move that pans between two renders still sees its own view state,
   * not the last frame's.
   */
  get lod(): "A" | "B" {
    if (
      this._viewStart !== this.lodStart ||
      this._viewEnd !== this.lodEnd ||
      this.events.length !== this.lodCount ||
      this.viewWidth !== this.lodWidth
    ) {
      this.lodStart = this._viewStart;
      this.lodEnd = this._viewEnd;
      this.lodCount = this.events.length;
      this.lodWidth = this.viewWidth;
      this.lodValue = this.computeLod();
    }
    return this.lodValue;
  }

  private computeLod(): "A" | "B" {
    const view = this.view;
    let visibleCount = 0;
    for (const e of this.events) {
      if (view.intersects(e.start, e.end ?? e.start)) visibleCount += 1;
    }
    if (visibleCount === 0) return "B";
    const pxPerEvent = view.width / visibleCount;
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
      if (event.start < this._viewStart || event.start > this._viewEnd)
        continue;
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
      if (
        x >= x1 - HIT &&
        x <= x2 + HIT &&
        y >= barTopY - HIT &&
        y <= barBotY + HIT
      ) {
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

    const view = this.view;
    const h = this.viewHeight;
    const spineY = h * SPINE_Y_FRACTION;

    // Respond anywhere above (and just below) the spine in the canvas.
    if (y > spineY + 8 || y < 0) return null;

    const grid = view.bins(LOD_BIN_WIDTH);
    // Columns are laid out on pixel multiples of LOD_BIN_WIDTH by renderLODA,
    // so the lookup inverts the draw rather than going back through time.
    const binIdx = Math.floor(x / LOD_BIN_WIDTH);
    if (binIdx < 0 || binIdx >= grid.count) return null;

    const { start: binStart, end: binEnd } = grid.rangeAt(binIdx);

    // Count events assigned to this bin (same assignment logic as renderLODA).
    const votes: Record<string, number> = {};
    let count = 0;
    let firstStart = Infinity;
    let lastStart = -Infinity;
    for (const event of this.events) {
      if (event.start > view.end) break;
      const end = event.end ?? event.start;
      if (end < view.start) continue;
      if (grid.indexAt(event.start) === binIdx) {
        count++;
        if (event.start < firstStart) firstStart = event.start;
        if (event.start > lastStart) lastStart = event.start;
        const cat = event.category ?? "Uncategorized";
        votes[cat] = (votes[cat] ?? 0) + 1;
      }
    }

    if (count === 0) return null;

    const categories = Object.entries(votes)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const coincident = firstStart === lastStart;

    return {
      timeStart: binStart,
      timeEnd: binEnd,
      zoomStart: coincident ? binStart : firstStart,
      zoomEnd: coincident ? binEnd : lastStart,
      count,
      categories,
    };
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
        years === 0
          ? "<1 yr"
          : years === 1
            ? "1 yr"
            : `${years.toLocaleString()} yrs`;

      gaps.push({ x1, x2, y, label });
    }

    return gaps;
  }

  // ─── Render loop ───────────────────────────────────────────────────────────

  /**
   * Run `cb` after every frame this controller draws. Returns an unsubscribe.
   *
   * The DOM overlay (gap indicators) has to repaint in lockstep with the
   * canvas. It used to drive itself from its own `requestAnimationFrame` loop
   * running alongside Pixi's ticker — two schedulers for one animation, which
   * on a dropped frame could paint DOM from a different view state than the
   * canvas underneath it. Subscribers run after the draw, so they observe
   * exactly the state that was just rendered.
   */
  onFrame(cb: () => void): () => void {
    this.frameSubscribers.add(cb);
    return () => this.frameSubscribers.delete(cb);
  }

  private render = (): void => {
    this.renderBackground();
    if (this.lod === "A") {
      this.renderLODA();
    } else {
      this.renderLODB();
    }
    for (const cb of this.frameSubscribers) cb();
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

    const view = this.view;
    const h = this.viewHeight;
    const spineY = h * SPINE_Y_FRACTION;
    const grid = view.bins(LOD_BIN_WIDTH);
    const numBins = grid.count;

    // Accumulate event count + category votes per bin.
    type Bin = { count: number; votes: Record<string, number> };
    const bins: Bin[] = Array.from({ length: numBins }, () => ({
      count: 0,
      votes: {},
    }));

    for (const event of this.events) {
      // Use start time to assign to a bin.
      if (event.start > view.end) break; // sorted, so safe to break
      const end = event.end ?? event.start;
      if (end < view.start) continue;

      const binIdx = grid.indexAt(event.start);
      bins[binIdx].count++;
      const cat = event.category ?? "";
      bins[binIdx].votes[cat] = (bins[binIdx].votes[cat] ?? 0) + 1;
    }

    const maxCount = Math.max(1, ...bins.map((b) => b.count));

    // Determine which bin index corresponds to the selected bin range.
    let selectedBinIdx = -1;
    if (this.selectedBinRange) {
      selectedBinIdx = grid.indexAt(this.selectedBinRange.start);
    }

    for (let i = 0; i < numBins; i++) {
      const bin = bins[i];
      if (bin.count === 0) continue;

      // Dominant category color.
      let dominantCat = "";
      let maxVotes = 0;
      for (const [cat, votes] of Object.entries(bin.votes)) {
        if (votes > maxVotes) {
          maxVotes = votes;
          dominantCat = cat;
        }
      }
      const color = CATEGORY_FILLS[dominantCat] ?? DEFAULT_EVENT_COLOR;
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
    const dotY = spineY - DOT_STEM; // instant dot sits here
    const barBotY = spineY - BAR_BOTTOM; // bottom edge of interval bar
    const barTopY = barBotY - BAR_HEIGHT; // top edge of interval bar

    // ── Pass 1: interval bars (drawn first, underneath dots) ─────────────────
    for (const event of this.events) {
      if (event.end == null) continue;

      const eventEnd = event.end;
      if (eventEnd < this._viewStart || event.start > this._viewEnd) continue;

      const color = CATEGORY_FILLS[event.category ?? ""] ?? DEFAULT_EVENT_COLOR;
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
      if (event.start < this._viewStart || event.start > this._viewEnd)
        continue;

      const x1 = this.timeToPixel(event.start);
      if (x1 < -DOT_RADIUS || x1 > w + DOT_RADIUS) continue;

      const color = CATEGORY_FILLS[event.category ?? ""] ?? DEFAULT_EVENT_COLOR;
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
    this.panOrigin = this.view;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isPanning) {
      this.setView(this.panOrigin.dragBy(e.offsetX - this.panOriginX));
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
    this.setView(this.view.zoomAt(factor, e.offsetX));
  };

  private onDblClick = (e: MouseEvent): void => {
    if (this.lod !== "A") return;
    const bin = this.getBinAt(e.offsetX, e.offsetY);
    if (!bin) return;
    this.selectedBinRange = { start: bin.zoomStart, end: bin.zoomEnd };
    this.selectedId = null;
    this.onSelectionChange(null);
    this.zoomToSelection();
  };

  private handleClick(x: number, y: number): void {
    if (this.lod === "A") {
      const bin = this.getBinAt(x, y);
      this.selectedBinRange = bin
        ? { start: bin.zoomStart, end: bin.zoomEnd }
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
    this.frameSubscribers.clear();
    this.app.destroy(false, { children: true });
  }
}
