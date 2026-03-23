<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  /* ── Light theme (default) ── */
  :global(:root) {
    --color-bg: #f5f5f5;
    --color-fg: #1a1a2e;
    --color-toolbar-bg: #ebebf0;
    --color-toolbar-border: #d0d0e0;
    --color-logo: #6666aa;
    --color-btn-bg: #e2e2ec;
    --color-btn-border: #c0c0d8;
    --color-btn-fg: #444466;
    --color-btn-hover-bg: #d4d4e8;
    --color-btn-hover-fg: #222244;
  }

  /* ── Dark theme ── */
  :global(:root[data-theme="dark"]) {
    --color-bg: #13131f;
    --color-fg: #ccccee;
    --color-toolbar-bg: #0d0d1a;
    --color-toolbar-border: #252545;
    --color-logo: #8888cc;
    --color-btn-bg: #1e1e38;
    --color-btn-border: #353565;
    --color-btn-fg: #9999cc;
    --color-btn-hover-bg: #28284a;
    --color-btn-hover-fg: #bbbbee;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: var(--color-bg);
    color: var(--color-fg);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }
</style>
