/**
 * The shipped dataset artifact: the authored event files resolved into the
 * exact JSON the frontend consumes.
 *
 * This used to be SQLite, read server-side by `+page.server.ts`. There is no
 * server any more — the browser `fetch`es this file and the Go binary serves it
 * from `//go:embed dist` — so the artifact is the *result* of the two queries
 * that load did, precomputed at build time.
 *
 * build.ts writes it; check-artifact.ts rebuilds it in memory and diffs. Both
 * go through `serializeArtifact` so there is exactly one definition of the
 * bytes, and the comparison is a plain string equality rather than the
 * schema-and-rows fingerprint SQLite's unstable encoding forced on us.
 */

import { loadAllBooks } from "./events.ts";

/** One event, in the shape `src/lib/timeline/types.ts` declares. */
export interface ArtifactEvent {
  id: string;
  start: number;
  end?: number;
  title: string;
  book?: string;
  category?: string;
  /** Unrendered, but part of the original swim-lane design — carried through. */
  lane?: string;
  meta?: Record<string, unknown>;
}

export interface ArtifactBook {
  name: string;
  eventCount: number;
}

export interface Artifact {
  datasetSlug: string;
  books: ArtifactBook[];
  events: ArtifactEvent[];
}

export interface BuildOptions {
  eventsDir: string;
  datasetSlug: string;
}

/**
 * Resolves the event files into the artifact. Throws on any authoring problem:
 * a partial dataset is worse than a failed build.
 */
export function buildArtifact({ eventsDir, datasetSlug }: BuildOptions): {
  artifact: Artifact;
  books: ReturnType<typeof loadAllBooks>["books"];
  spread: number;
} {
  const { books, errors, spread } = loadAllBooks(eventsDir);

  if (errors.length > 0) {
    throw new BuildError(
      `Refusing to build — ${errors.length} problem(s) in the event files:\n\n` +
        errors.map((error) => `  ${error}`).join("\n"),
    );
  }

  const events: ArtifactEvent[] = books.flatMap(({ events: resolved }) =>
    resolved.map((event) => ({
      id: event.id,
      start: event.start,
      end: event.end ?? undefined,
      title: event.title,
      book: event.book ?? undefined,
      category: event.category ?? undefined,
      lane: event.lane ?? undefined,
      meta: event.meta ?? undefined,
    })),
  );

  if (events.length === 0)
    throw new BuildError(`No events found in ${eventsDir}`);

  // The old SQL ordered by start_time; the renderer's binary search depends on
  // it. Ties keep canonical book order, which loadAllBooks already applied.
  events.sort((a, b) => a.start - b.start);

  const artifact: Artifact = {
    datasetSlug,
    // Canonical order, as `ORDER BY b.book_order` gave.
    books: books.map(({ file, events: resolved }) => ({
      name: file.book,
      eventCount: resolved.length,
    })),
    events,
  };

  return { artifact, books, spread };
}

/** An authoring problem, not a crash: the caller prints it without a stack. */
export class BuildError extends Error {}

/**
 * The bytes. Key order is fixed by the object literals above and `JSON.stringify`
 * is deterministic for a given input, so two builds of identical event files are
 * byte-identical — which is what lets check-artifact.ts diff strings.
 *
 * Minified. Indenting costs 122KB (653 vs 531) which `//go:embed` puts straight
 * into the binary and `http.FileServer` sends uncompressed, and buys nothing:
 * this file is machine-read, and the artefact humans review is the event files.
 */
export function serializeArtifact(artifact: Artifact): string {
  return `${JSON.stringify(artifact)}\n`;
}
