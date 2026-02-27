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

    :global(html, body) {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        background: #13131f;
        color: #ccccee;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
    }
</style>
