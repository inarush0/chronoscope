<script lang="ts">
    import Timeline from "$lib/timeline/Timeline.svelte";

    // Initial view: 24-hour window centered on now, playhead at now.
    const now = Date.now();
    const initialViewStart = now - 12 * 60 * 60 * 1000;
    const initialViewEnd = now + 12 * 60 * 60 * 1000;

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
        </div>
    </header>

    <main class="timeline-area">
        <Timeline
            bind:this={timeline}
            {initialViewStart}
            {initialViewEnd}
            initialPlayhead={now}
        />
    </main>
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
        background: #0d0d1a;
        border-bottom: 1px solid #252545;
        flex-shrink: 0;
    }

    .logo {
        font-size: 13px;
        font-weight: 600;
        color: #8888cc;
        letter-spacing: 0.05em;
        margin-right: auto;
    }

    .toolbar-actions {
        display: flex;
        gap: 8px;
    }

    button {
        padding: 3px 10px;
        background: #1e1e38;
        border: 1px solid #353565;
        border-radius: 3px;
        color: #9999cc;
        cursor: pointer;
        font-size: 11px;
        font-family: inherit;
    }

    button:hover {
        background: #28284a;
        color: #bbbbee;
    }

    .timeline-area {
        flex: 1;
        min-height: 0; /* allows flex child to shrink below content size */
    }
</style>
