<script lang="ts">
    import type { TimelineEvent } from "$lib/timeline/types.js";

    interface Props {
        event: TimelineEvent;
        onClose: () => void;
    }

    let { event, onClose }: Props = $props();

    // ─── Date formatting ───────────────────────────────────────────────────────

    function formatYear(ts: number): string {
        const year = new Date(ts).getUTCFullYear();
        return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
    }

    const dateLabel = $derived(
        event.end != null
            ? `${formatYear(event.start)} – ${formatYear(event.end)}`
            : formatYear(event.start),
    );

    // ─── Category colors (mirror the Pixi CATEGORY_COLORS) ────────────────────

    const CATEGORY_COLORS: Record<string, string> = {
        "Primeval History": "#6666cc",
        Abraham: "#c8882a",
        Jacob: "#3d8c3d",
        Joseph: "#cc5533",
    };

    const categoryColor = $derived(
        CATEGORY_COLORS[event.category ?? ""] ?? "#7777aa",
    );

    // ─── BibleGateway — re-scan DOM so the reference becomes a tooltip link ───

    $effect(() => {
        // Read event.id so the effect re-runs whenever the selected event changes.
        void event.id;
        // BGLinks scans the entire document; run after the DOM has updated.
        window.BGLinks?.linkVerses();
    });
</script>

<!-- ─── Markup ───────────────────────────────────────────────────────────────── -->

<div class="inspector">
    <!-- Header -->
    <div class="inspector-header">
        <span
            class="category-badge"
            style="background: {categoryColor}22; color: {categoryColor}; border-color: {categoryColor}55"
        >
            {event.category ?? "Event"}
        </span>
        <button class="close-btn" onclick={onClose} aria-label="Close inspector">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="2" y1="2" x2="12" y2="12"/>
                <line x1="12" y1="2" x2="2" y2="12"/>
            </svg>
        </button>
    </div>

    <!-- Title -->
    <h2 class="event-title">{event.title}</h2>

    <!-- Date -->
    <div class="event-date">{dateLabel}</div>

    <!-- Reference — BGLinks will convert this to an interactive link -->
    {#if event.meta?.reference}
        <div class="event-reference">
            <span class="reference-icon">📖</span>
            <span class="reference-text">{event.meta.reference}</span>
        </div>
    {/if}

    <!-- Description -->
    {#if event.meta?.description}
        <p class="event-description">{event.meta.description}</p>
    {/if}
</div>

<!-- ─── Styles ──────────────────────────────────────────────────────────────── -->

<style>
    .inspector {
        padding: 16px;
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    /* ── Header ── */

    .inspector-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .category-badge {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: 10px;
        border: 1px solid;
    }

    .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 3px;
        color: var(--color-btn-fg);
        cursor: pointer;
        flex-shrink: 0;
    }

    .close-btn:hover {
        background: var(--color-btn-hover-bg);
        color: var(--color-btn-hover-fg);
    }

    /* ── Content ── */

    .event-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--color-fg);
        line-height: 1.3;
    }

    .event-date {
        font-size: 12px;
        font-family: ui-monospace, "Cascadia Code", "Fira Mono", monospace;
        color: var(--color-logo);
    }

    .event-reference {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 13px;
    }

    .reference-icon {
        font-size: 14px;
        flex-shrink: 0;
    }

    .reference-text {
        color: var(--color-logo);
        font-weight: 500;
    }

    /* BibleGateway converts the reference text to an <a> — inherit our color */
    .reference-text :global(a) {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .event-description {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--color-fg);
        opacity: 0.85;
    }
</style>
