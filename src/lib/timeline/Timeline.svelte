<script lang="ts">
  import { onMount } from "svelte";
  import { TimelineController, THEME_COLORS } from "./TimelineController.js";
  import type {
    TimelineControllerOptions,
    TimelineColors,
    BinInfo,
    GapInfo,
  } from "./TimelineController.js";
  import type { TimelineEvent } from "./types.js";

  // ─── Props ─────────────────────────────────────────────────────────────────

  interface Props {
    initialViewStart: number;
    initialViewEnd: number;
    colors?: TimelineColors;
    dataset?: TimelineEvent[];
    onSelectionChange?: TimelineControllerOptions["onSelectionChange"];
  }

  let {
    initialViewStart,
    initialViewEnd,
    colors = THEME_COLORS.light,
    dataset,
    onSelectionChange,
  }: Props = $props();

  // ─── DOM refs ──────────────────────────────────────────────────────────────

  let wrapper: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  // ─── Controller ────────────────────────────────────────────────────────────

  let ctrl = $state<TimelineController | undefined>(undefined);

  // Propagate prop changes to the controller after it is initialised.
  $effect(() => {
    ctrl?.setColors(colors);
  });
  $effect(() => {
    if (dataset) ctrl?.setDataset(dataset);
  });

  // ─── Hover / tooltip state ─────────────────────────────────────────────────

  let hoveredEvent = $state<TimelineEvent | null>(null);
  let hoveredBin = $state<BinInfo | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  let gaps = $state<GapInfo[]>([]);

  function formatYear(ts: number): string {
    const year = new Date(ts).getUTCFullYear();
    return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
  }

  function onMouseMove(e: MouseEvent) {
    if (!ctrl) return;
    tooltipX = e.offsetX;
    tooltipY = e.offsetY;
    if (ctrl.lod === "A") {
      hoveredEvent = null;
      hoveredBin = ctrl.getBinAt(e.offsetX, e.offsetY);
    } else {
      hoveredBin = null;
      hoveredEvent = ctrl.getEventAt(e.offsetX, e.offsetY);
    }
  }

  function onMouseLeave() {
    hoveredEvent = null;
    hoveredBin = null;
  }

  // ─── Exposed imperative API ────────────────────────────────────────────────

  export function resetView() {
    ctrl?.resetView();
  }
  export function zoomToSelection() {
    ctrl?.zoomToSelection();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(() => {
    let ro: ResizeObserver | undefined;
    let rafId = 0;

    async function init() {
      ctrl = await TimelineController.create(canvas, {
        initialViewStart,
        initialViewEnd,
        colors,
        onSelectionChange,
      });

      // Load dataset immediately — the $effect above may not re-run
      // reliably after an async assignment.
      if (dataset) ctrl.setDataset(dataset);

      ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        ctrl!.resize(width, height);
      });
      ro.observe(wrapper);

      // Update gap positions every frame (they shift on every pan/zoom).
      function tick() {
        gaps = ctrl!.getGaps();
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }

    init();

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      ctrl?.destroy();
    };
  });
</script>

<!-- ─── Markup ───────────────────────────────────────────────────────────────── -->

<div class="timeline-root" bind:this={wrapper}>
  <canvas
    bind:this={canvas}
    onmousemove={onMouseMove}
    onmouseleave={onMouseLeave}
  ></canvas>

  <!-- ── Gap indicators (LOD B only) ── -->
  {#each gaps as gap}
    <div
      class="gap-line"
      style="left: {gap.x1}px; width: {gap.x2 - gap.x1}px; top: {gap.y}px"
    ></div>
    {#if gap.x2 - gap.x1 > 48}
      <span
        class="gap-label"
        style="left: {(gap.x1 + gap.x2) / 2}px; top: {gap.y}px"
        >{gap.label}</span
      >
    {/if}
  {/each}

  {#if hoveredEvent}
    <div
      class="tooltip"
      style="left: {tooltipX + 14}px; top: {tooltipY - 12}px"
    >
      <div class="tooltip-title">{hoveredEvent.title}</div>
      {#if hoveredEvent.meta?.reference}
        <div class="tooltip-ref">{hoveredEvent.meta.reference}</div>
      {/if}
    </div>
  {:else if hoveredBin}
    <div
      class="tooltip"
      style="left: {tooltipX + 14}px; top: {tooltipY - 12}px"
    >
      <div class="tooltip-title">
        {hoveredBin.count} event{hoveredBin.count === 1 ? "" : "s"}
      </div>
      <div class="tooltip-range">
        {formatYear(hoveredBin.timeStart)} – {formatYear(hoveredBin.timeEnd)}
      </div>
      {#each hoveredBin.categories.slice(0, 3) as cat}
        <div class="tooltip-cat">
          <span class="tooltip-cat-name">{cat.name || "Uncategorized"}</span>
          <span class="tooltip-cat-count">{cat.count}</span>
        </div>
      {/each}
      <div class="tooltip-hint">
        Click to select · Zoom to Selection to drill in
      </div>
    </div>
  {/if}
</div>

<!-- ─── Styles ──────────────────────────────────────────────────────────────── -->

<style>
  .timeline-root {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* ── Gap indicators ── */

  .gap-line {
    position: absolute;
    height: 1px;
    background: var(--color-logo);
    opacity: 0.25;
    pointer-events: none;
  }

  .gap-label {
    position: absolute;
    transform: translate(-50%, 3px);
    font-size: 9px;
    font-family: ui-monospace, "Cascadia Code", "Fira Mono", monospace;
    color: var(--color-fg);
    opacity: 0.4;
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
  }

  /* ── Tooltip ── */

  .tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--color-toolbar-bg);
    border: 1px solid var(--color-toolbar-border);
    border-radius: 4px;
    padding: 6px 10px;
    max-width: 240px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tooltip-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-fg);
    line-height: 1.3;
  }

  .tooltip-ref {
    font-size: 11px;
    font-family: ui-monospace, "Cascadia Code", "Fira Mono", monospace;
    color: var(--color-logo);
  }

  /* ── LOD A bin tooltip extras ── */

  .tooltip-range {
    font-size: 10px;
    font-family: ui-monospace, "Cascadia Code", "Fira Mono", monospace;
    color: var(--color-logo);
  }

  .tooltip-cat {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: var(--color-fg);
    opacity: 0.8;
  }

  .tooltip-cat-name {
    font-style: italic;
  }

  .tooltip-cat-count {
    font-variant-numeric: tabular-nums;
  }

  .tooltip-hint {
    margin-top: 2px;
    font-size: 10px;
    color: var(--color-fg);
    opacity: 0.45;
  }
</style>
