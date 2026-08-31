/**
 * App shell: toolbar, theme, selection wiring. Replaces `+page.svelte` and
 * `+layout.svelte`.
 *
 * NO TOP-LEVEL AWAIT IN THIS FILE. Pixi 8 resolves its environment and
 * renderer through dynamic `import()`s. In a production build those land in
 * sibling chunks of the entry chunk, so awaiting anything that reaches
 * `Application.init()` at the top level deadlocks: the import waits for the
 * entry module to finish evaluating, and the entry module is blocked on the
 * import. It fails silently — no error, just a canvas that never initialises —
 * and only in `vite build`, never in `vite dev`. Keep the async work inside
 * `main()`.
 */

import "./main.css";
import { THEME_COLORS } from "./theme.js";
import type { Theme } from "./theme.js";
import { createTimelineView } from "./timeline/timelineView.js";
import type { TimelineView } from "./timeline/timelineView.js";
import { createInspector } from "./inspector/inspector.js";
import { loadDataset, initialView } from "./dataset.js";
import type { TimelineEvent } from "./timeline/types.js";

const SUN_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
  <line x1="8" y1="1" x2="8" y2="3" />
  <line x1="8" y1="13" x2="8" y2="15" />
  <line x1="1" y1="8" x2="3" y2="8" />
  <line x1="13" y1="8" x2="15" y2="8" />
  <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
  <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
  <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" />
  <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
</svg>`;

const MOON_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M6 2a6 6 0 1 0 8 8 4.5 4.5 0 1 1-8-8z" />
</svg>`;

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("#app not found");
  root.classList.add("app");

  const dataset = await loadDataset();
  const events: TimelineEvent[] = dataset.events;
  const byId = new Map(events.map((e) => [e.id, e]));

  // ─── Theme ───────────────────────────────────────────────────────────────
  //
  // Resolved before the controller exists so the canvas and the DOM chrome are
  // never a frame out of step (parity item 10.6).

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let systemTheme: Theme = mq.matches ? "dark" : "light";
  // Once the user picks a theme by hand, OS changes stop applying for the rest
  // of the session (parity item 10.4). Nothing is persisted (10.5).
  let manualOverride: Theme | null = null;
  const theme = (): Theme => manualOverride ?? systemTheme;

  // Assigned at the end of `main`; the toolbar handlers below can fire before
  // Pixi has finished initialising, hence the optional calls.
  let timeline: TimelineView | undefined;

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";

  const logo = document.createElement("span");
  logo.className = "logo";
  logo.textContent = "Chronoscope";

  const actions = document.createElement("div");
  actions.className = "toolbar-actions";

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "icon-btn";
  themeBtn.setAttribute("aria-label", "Toggle theme");

  function applyTheme(): void {
    document.documentElement.setAttribute("data-theme", theme());
    themeBtn.innerHTML = theme() === "dark" ? SUN_ICON : MOON_ICON;
    timeline?.setColors(THEME_COLORS[theme()]);
  }

  themeBtn.addEventListener("click", () => {
    manualOverride = theme() === "dark" ? "light" : "dark";
    applyTheme();
  });

  mq.addEventListener("change", (e) => {
    if (manualOverride !== null) return;
    systemTheme = e.matches ? "dark" : "light";
    applyTheme();
  });

  actions.append(
    button("Reset View", () => timeline?.resetView()),
    button("Zoom to Selection", () => timeline?.zoomToSelection()),
    themeBtn,
  );
  toolbar.append(logo, actions);

  // ─── Layout ──────────────────────────────────────────────────────────────

  const contentArea = document.createElement("div");
  contentArea.className = "content-area";
  const timelineArea = document.createElement("main");
  timelineArea.className = "timeline-area";
  contentArea.append(timelineArea);
  root.append(toolbar, contentArea);

  // Closing the panel clears the app-level selection only; the controller
  // keeps its `selectedId`, so the event stays outlined on the canvas and
  // Zoom to Selection still targets it. That is quirk Q3 — preserved.
  const inspector = createInspector(contentArea, () => inspector.show(null));

  applyTheme();

  // ─── Timeline ────────────────────────────────────────────────────────────

  const { start, end } = initialView(events);
  timeline = await createTimelineView(timelineArea, {
    initialViewStart: start,
    initialViewEnd: end,
    colors: THEME_COLORS[theme()],
    dataset: events,
    onSelectionChange: (id) =>
      inspector.show(id ? (byId.get(id) ?? null) : null),
  });
}

void main();
