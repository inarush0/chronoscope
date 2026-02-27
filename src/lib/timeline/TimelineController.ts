import { Application, Graphics } from "pixi.js";
import { scaleTime } from "d3-scale";
import type { Time, TimelineEvent, TickMark, ViewState } from "./types.js";

// ─── Layout constants ───────────────────────────────────────────────────────

const HEADER_HEIGHT = 32; // px — tick label band at top
const PLAYHEAD_HIT_ZONE = 8; // px — pointer capture radius for scrub
const MIN_CLICK_MOVEMENT = 4; // px — below this, pointerdown+up is a click
const ZOOM_FACTOR = 1.12; // per wheel tick

// ─── Public options ──────────────────────────────────────────────────────────

export interface TimelineControllerOptions {
  initialViewStart: Time;
  initialViewEnd: Time;
  initialPlayhead?: Time;
  onSelectionChange?: (id: string | null) => void;
  onPlayheadChange?: (time: Time) => void;
}

// ─── Controller ──────────────────────────────────────────────────────────────

export class TimelineController {
  private readonly app: Application;

  // --- Render state (owned here, never in Svelte) ---
  private _viewStart: Time;
  private _viewEnd: Time;
  private _playhead: Time;

  // --- Interaction state ---
  private isPanning = false;
  private panOriginX = 0;
  private panOriginStart: Time = 0;
  private panOriginEnd: Time = 0;

  private isScrubbing = false;

  // --- Selection ---
  private selectedId: string | null = null;

  // --- Pixi layers ---
  private readonly gridLayer: Graphics;
  private readonly eventLayer: Graphics;
  private readonly playheadLayer: Graphics;

  // --- Dataset ---
  private events: TimelineEvent[] = [];

  // --- Default view (for reset) ---
  private readonly defaultViewStart: Time;
  private readonly defaultViewEnd: Time;

  // --- App-level callbacks (bridge to Svelte) ---
  private readonly onSelectionChange: (id: string | null) => void;
  private readonly onPlayheadChange: (time: Time) => void;

  // ─── Private constructor — use TimelineController.create() ─────────────────

  private constructor(
    app: Application,
    options: TimelineControllerOptions,
    gridLayer: Graphics,
    eventLayer: Graphics,
    playheadLayer: Graphics,
  ) {
    this.app = app;

    this._viewStart = options.initialViewStart;
    this._viewEnd = options.initialViewEnd;
    this._playhead = options.initialPlayhead ?? options.initialViewStart;
    this.defaultViewStart = options.initialViewStart;
    this.defaultViewEnd = options.initialViewEnd;

    this.onSelectionChange = options.onSelectionChange ?? (() => {});
    this.onPlayheadChange = options.onPlayheadChange ?? (() => {});

    this.gridLayer = gridLayer;
    this.eventLayer = eventLayer;
    this.playheadLayer = playheadLayer;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  static async create(
    canvas: HTMLCanvasElement,
    options: TimelineControllerOptions,
  ): Promise<TimelineController> {
    const app = new Application();
    await app.init({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      backgroundColor: 0x13131f,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    const gridLayer = new Graphics();
    const eventLayer = new Graphics();
    const playheadLayer = new Graphics();
    app.stage.addChild(gridLayer, eventLayer, playheadLayer);

    const ctrl = new TimelineController(
      app,
      options,
      gridLayer,
      eventLayer,
      playheadLayer,
    );
    ctrl.setupInteraction(canvas);
    app.ticker.add(ctrl.render);
    return ctrl;
  }

  // ─── Coordinate transforms ─────────────────────────────────────────────────

  // CSS-pixel dimensions from app.screen — matches offsetX/offsetY in pointer events.
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

  /**
   * Zoom by `factor` (>1 = zoom in), anchored to `cursorX` in CSS pixels.
   * The time value under the cursor remains at the same pixel position after zoom.
   */
  zoom(factor: number, cursorX: number): void {
    const tCursor = this.pixelToTime(cursorX);
    const span = this._viewEnd - this._viewStart;
    const newSpan = span / factor;
    const fraction = cursorX / this.viewWidth;
    this._viewStart = tCursor - newSpan * fraction;
    this._viewEnd = tCursor + newSpan * (1 - fraction);
  }

  /** Pan by `dx` CSS pixels (positive = move view right / time earlier). */
  pan(dx: number): void {
    const dt = (dx / this.viewWidth) * (this._viewEnd - this._viewStart);
    this._viewStart -= dt;
    this._viewEnd -= dt;
  }

  setPlayhead(time: Time): void {
    this._playhead = time;
    this.onPlayheadChange(time);
  }

  resetView(): void {
    this._viewStart = this.defaultViewStart;
    this._viewEnd = this.defaultViewEnd;
  }

  /** Zoom viewport to frame the selected event with padding. */
  zoomToSelection(): void {
    if (!this.selectedId) return;
    const event = this.events.find((e) => e.id === this.selectedId);
    if (!event) return;

    const end = event.end ?? event.start;
    // Pad to at least 10% of current span, or the event's own span, whichever is larger.
    const eventSpan = Math.max(end - event.start, 1);
    const padding = Math.max(
      eventSpan * 0.5,
      (this._viewEnd - this._viewStart) * 0.05,
    );
    this._viewStart = event.start - padding;
    this._viewEnd = end + padding;
  }

  // ─── Dataset ───────────────────────────────────────────────────────────────

  /** Replace the active dataset. Events are kept sorted by start time. */
  setDataset(events: TimelineEvent[]): void {
    this.events = [...events].sort((a, b) => a.start - b.start);
  }

  // ─── Selection ─────────────────────────────────────────────────────────────

  selectEvent(id: string | null): void {
    this.selectedId = id;
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
      playhead: this._playhead,
    };
  }

  getPlayheadX(): number {
    return this.timeToPixel(this._playhead);
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
    this.renderGrid();
    this.renderPlayhead();
    // Event rendering is added next (LOD step).
    this.eventLayer.clear();
  };

  private renderGrid(): void {
    const g = this.gridLayer;
    g.clear();

    const w = this.viewWidth;
    const h = this.viewHeight;

    // Background
    g.rect(0, 0, w, h).fill(0x13131f);

    // Header band
    g.rect(0, 0, w, HEADER_HEIGHT).fill(0x0d0d1a);

    // Tick lines — batch all into a single stroke call for one draw call.
    const scale = scaleTime()
      .domain([new Date(this._viewStart), new Date(this._viewEnd)])
      .range([0, w]);
    const tickCount = Math.max(2, Math.floor(w / 80));
    const ticks = scale.ticks(tickCount);

    // Major tick lines through the lane area
    for (const tick of ticks) {
      const x = Math.round(this.timeToPixel(tick.getTime()));
      g.moveTo(x, HEADER_HEIGHT).lineTo(x, h);
    }
    g.stroke({ color: 0x252540, width: 1 });

    // Tick nubs in the header
    for (const tick of ticks) {
      const x = Math.round(this.timeToPixel(tick.getTime()));
      g.moveTo(x, HEADER_HEIGHT - 5).lineTo(x, HEADER_HEIGHT);
    }
    g.stroke({ color: 0x5555aa, width: 1 });

    // Header/lane separator
    g.moveTo(0, HEADER_HEIGHT).lineTo(w, HEADER_HEIGHT);
    g.stroke({ color: 0x30305a, width: 1 });
  }

  private renderPlayhead(): void {
    const g = this.playheadLayer;
    g.clear();

    const x = Math.round(this.timeToPixel(this._playhead));
    const h = this.viewHeight;

    // Line
    g.moveTo(x, 0).lineTo(x, h);
    g.stroke({ color: 0xff5f5f, width: 2 });

    // Triangle handle at top
    const s = 7;
    g.moveTo(x - s, 0)
      .lineTo(x + s, 0)
      .lineTo(x, s * 1.6)
      .closePath()
      .fill(0xff5f5f);
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  private setupInteraction(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onPointerDown = (e: PointerEvent): void => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const x = e.offsetX;

    // Playhead hit check takes priority over pan.
    if (Math.abs(x - this.getPlayheadX()) <= PLAYHEAD_HIT_ZONE) {
      this.isScrubbing = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "ew-resize";
      return;
    }

    this.isPanning = true;
    this.panOriginX = x;
    this.panOriginStart = this._viewStart;
    this.panOriginEnd = this._viewEnd;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isScrubbing) {
      this.setPlayhead(this.pixelToTime(e.offsetX));
      return;
    }

    if (this.isPanning) {
      const dx = e.offsetX - this.panOriginX;
      const span = this.panOriginEnd - this.panOriginStart;
      // Subtract: dragging right moves the view to earlier times.
      const dt = -(dx / this.viewWidth) * span;
      this._viewStart = this.panOriginStart + dt;
      this._viewEnd = this.panOriginEnd + dt;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const totalMove = Math.abs(e.offsetX - this.panOriginX);

    if (this.isPanning && totalMove < MIN_CLICK_MOVEMENT) {
      // Treat as a click — event picking will be wired here.
      this.handleClick(e.offsetX, e.offsetY);
    }

    this.isPanning = false;
    this.isScrubbing = false;
    canvas.style.cursor = "";
  };

  private onPointerLeave = (): void => {
    this.isPanning = false;
    this.isScrubbing = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    this.zoom(factor, e.offsetX);
  };

  /** Click handler — event picking will be fleshed out in the LOD/picking step. */
  private handleClick(x: number, _y: number): void {
    // TODO: binary-search events visible in [viewStart, viewEnd], hit-test at (x, y),
    // call selectEvent(id) or selectEvent(null).
    void x;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Call when the canvas element is resized. */
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
    this.app.ticker.remove(this.render);
    this.app.destroy(false, { children: true });
  }
}
