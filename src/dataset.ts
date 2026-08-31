import type { TimelineEvent } from "./timeline/types.js";

/**
 * Shape of `static/chronoscope.json`, produced by `dataset/build.ts`. It is
 * byte-for-byte the payload the old `+page.server.ts` returned, so `books` and
 * `datasetSlug` ride along even though the shell renders neither.
 */
export interface Dataset {
  datasetSlug: string;
  books: { name: string; eventCount: number }[];
  events: TimelineEvent[];
}

/** Served from the root of `dist/` by Vite in dev and by the Go binary in prod. */
export async function loadDataset(): Promise<Dataset> {
  const res = await fetch("/chronoscope.json");
  if (!res.ok) {
    throw new Error(`Failed to load dataset: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Dataset;
}

/** Full extent of the dataset plus 5% padding on each side. */
export function initialView(events: TimelineEvent[]): {
  start: number;
  end: number;
} {
  const times = events.flatMap((e) =>
    e.end != null ? [e.start, e.end] : [e.start],
  );
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = (max - min) * 0.05;
  return { start: min - pad, end: max + pad };
}
