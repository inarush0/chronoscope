# chronoscope

Chronoscope is a high-performance, zoomable timeline engine inspired by DAWs
and map-style navigation. It enables smooth pan, scrub, and semantic zoom
across large temporal datasets to explore scale, sequence, and causality across
history, fiction, or any time-based domain.

## Creating a project

To recreate this project with the same configuration:

```sh
bun x sv create --template minimal --types ts --install bun .
```

## Developing

Install dependencies:

```sh
bun install
```

Start a development server:

```sh
bun run dev

# or start the server and open the app in a new browser tab
bun run dev -- --open
```

## Building

To create a production version of your app:

```sh
bun run build
```

You can preview the production build with `bun run preview`.

> To deploy your app, you may need to install an
> [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
