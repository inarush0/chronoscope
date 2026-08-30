/**
 * Vanilla-TS entry point for the scaffold (wayfinder ticket #11).
 *
 * Scope: prove PixiJS bundles under plain Vite and that the *unmodified*
 * `TimelineController` renders in a page with no SvelteKit, no SSR and no
 * routing. The real shell — toolbar, inspector, tooltips, tick labels, theme
 * toggle — is ticket #13; everything below the controller call is throwaway.
 *
 * NO TOP-LEVEL AWAIT IN THIS FILE. Pixi 8 resolves its environment and
 * renderer through dynamic `import()`s. In a production build those land in
 * sibling chunks of the entry chunk, so awaiting `Application.init()` at the
 * top level deadlocks: the import waits for the entry module to finish
 * evaluating, and the entry module is blocked on the import. It fails silently
 * — no error, just a canvas that never initialises — and only in `vite build`,
 * never in `vite dev`. Keep the async work inside `main()`.
 */

import "./main.css";
import {
  TimelineController,
  THEME_COLORS,
} from "./lib/timeline/TimelineController.js";
import { FIXTURE_EVENTS } from "./fixture.js";

function mount(root: HTMLElement): {
  banner: HTMLElement;
  wrapper: HTMLElement;
  canvas: HTMLCanvasElement;
} {
  const banner = document.createElement("div");
  banner.className = "scaffold-banner";

  const wrapper = document.createElement("div");
  wrapper.className = "timeline-wrapper";
  const canvas = document.createElement("canvas");
  wrapper.append(canvas);

  root.append(banner, wrapper);
  return { banner, wrapper, canvas };
}

/** Full extent of the fixture plus 5% padding — same rule as `+page.svelte`. */
function defaultView(): { start: number; end: number } {
  const times = FIXTURE_EVENTS.flatMap((e) =>
    e.end != null ? [e.start, e.end] : [e.start],
  );
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = (max - min) * 0.05;
  return { start: min - pad, end: max + pad };
}

function year(ms: number): string {
  const y = new Date(ms).getUTCFullYear();
  return y <= 0 ? `${1 - y} BC` : `${y} AD`;
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("#app not found");

  const { banner, wrapper, canvas } = mount(root);
  const { start, end } = defaultView();

  let selectedId: string | null = null;

  const ctrl = await TimelineController.create(canvas, {
    initialViewStart: start,
    initialViewEnd: end,
    colors: THEME_COLORS.light,
    onSelectionChange: (id) => {
      selectedId = id;
    },
  });

  ctrl.setDataset(FIXTURE_EVENTS);

  new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) ctrl.resize(width, height);
  }).observe(wrapper);

  // Surface the render state every frame so the scaffold is judgeable by eye.
  const tick = (): void => {
    const { viewStart, viewEnd } = ctrl.getViewState();
    banner.textContent = [
      `SCAFFOLD — ${FIXTURE_EVENTS.length} fixture events`,
      `view ${year(viewStart)} → ${year(viewEnd)}`,
      `LOD ${ctrl.lod}`,
      `gaps ${ctrl.getGaps().length}`,
      `selected ${selectedId ?? "—"}`,
    ].join("  |  ");
    requestAnimationFrame(tick);
  };
  tick();
}

void main();
