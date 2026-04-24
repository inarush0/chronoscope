<script lang="ts">
  import { onMount } from "svelte";
  import Timeline from "$lib/timeline/Timeline.svelte";
  import Inspector from "$lib/inspector/Inspector.svelte";
  import { THEME_COLORS } from "$lib/timeline/TimelineController.js";
  import type { TimelineEvent } from "$lib/timeline/types.js";

  let { data } = $props();

  // ─── Theme ─────────────────────────────────────────────────────────────────

  let systemTheme = $state<"light" | "dark">("light");
  let manualOverride = $state<"light" | "dark" | null>(null);
  const theme = $derived(manualOverride ?? systemTheme);
  const colors = $derived(THEME_COLORS[theme]);

  $effect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  });

  onMount(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme = mq.matches ? "dark" : "light";
    const onChange = (e: MediaQueryListEvent) => {
      if (manualOverride === null) systemTheme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  function toggleTheme() {
    manualOverride = theme === "dark" ? "light" : "dark";
  }

  // ─── Dataset ───────────────────────────────────────────────────────────────

  const dataset = $derived(data.events as TimelineEvent[]);

  const initialViewStart = $derived.by(() => {
    const times = dataset.flatMap((e) =>
      e.end != null ? [e.start, e.end] : [e.start],
    );
    const min = Math.min(...times);
    const max = Math.max(...times);
    const pad = (max - min) * 0.05;
    return min - pad;
  });

  const initialViewEnd = $derived.by(() => {
    const times = dataset.flatMap((e) =>
      e.end != null ? [e.start, e.end] : [e.start],
    );
    const min = Math.min(...times);
    const max = Math.max(...times);
    const pad = (max - min) * 0.05;
    return max + pad;
  });

  // ─── Selection ─────────────────────────────────────────────────────────────

  let selectedEvent = $state<TimelineEvent | null>(null);

  function onSelectionChange(id: string | null) {
    selectedEvent = id ? (dataset.find((e) => e.id === id) ?? null) : null;
  }

  // ─── Timeline ref ──────────────────────────────────────────────────────────

  let timeline:
    | { resetView: () => void; zoomToSelection: () => void }
    | undefined;
</script>

<div class="app">
  <header class="toolbar">
    <span class="logo">Chronoscope</span>
    <div class="toolbar-actions">
      <button onclick={() => timeline?.resetView()}>Reset View</button>
      <button onclick={() => timeline?.zoomToSelection()}
        >Zoom to Selection</button
      >
      <button class="icon-btn" onclick={toggleTheme} aria-label="Toggle theme">
        {#if theme === "dark"}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
            <line x1="8" y1="1" x2="8" y2="3" />
            <line x1="8" y1="13" x2="8" y2="15" />
            <line x1="1" y1="8" x2="3" y2="8" />
            <line x1="13" y1="8" x2="15" y2="8" />
            <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
            <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
            <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" />
            <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 2a6 6 0 1 0 8 8 4.5 4.5 0 1 1-8-8z" />
          </svg>
        {/if}
      </button>
    </div>
  </header>

  <div class="content-area">
    <main class="timeline-area">
      <Timeline
        bind:this={timeline}
        {initialViewStart}
        {initialViewEnd}
        {colors}
        {dataset}
        {onSelectionChange}
      />
    </main>

    {#if selectedEvent}
      <aside class="inspector-panel">
        <Inspector
          event={selectedEvent}
          onClose={() => (selectedEvent = null)}
        />
      </aside>
    {/if}
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 40px;
    background: var(--color-toolbar-bg);
    border-bottom: 1px solid var(--color-toolbar-border);
    flex-shrink: 0;
  }

  .logo {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-logo);
    letter-spacing: 0.05em;
    margin-right: auto;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  button {
    padding: 3px 10px;
    background: var(--color-btn-bg);
    border: 1px solid var(--color-btn-border);
    border-radius: 3px;
    color: var(--color-btn-fg);
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }

  button:hover {
    background: var(--color-btn-hover-bg);
    color: var(--color-btn-hover-fg);
  }

  .icon-btn {
    padding: 3px 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Content area: timeline + inspector side by side ── */

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
  }

  .timeline-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .inspector-panel {
    width: 300px;
    flex-shrink: 0;
    background: var(--color-toolbar-bg);
    border-left: 1px solid var(--color-toolbar-border);
    overflow-y: auto;
  }
</style>
