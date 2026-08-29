/**
 * Authored event-file format and its validation.
 *
 * One file per book under data/events/. These files are the source of truth
 * and live in version control; the SQLite database is a build artifact.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDate, type Precision } from './dates.ts';

export interface AuthoredEvent {
  id: string;
  title: string;
  /** "1446-04-15 BC", "1446 BC", "57 AD" — see lib/dates.ts */
  start: string;
  end?: string;
  category?: string;
  lane?: string;
  reference?: string;
  description?: string;
  /**
   * How the date was arrived at. Non-narrative books are dated by composition
   * or historical setting rather than by a narrated sequence of events.
   */
  datingBasis?: 'narrative' | 'traditional' | 'composition' | 'scholarly-estimate';
}

export interface BookFile {
  book: string;
  order: number;
  testament: 'Old Testament' | 'New Testament' | 'Deuterocanon';
  events: AuthoredEvent[];
}

/** An event resolved to epoch milliseconds, ready for insertion. */
export interface ResolvedEvent {
  id: string;
  title: string;
  start: number;
  end: number | null;
  book: string;
  category: string | null;
  lane: string | null;
  meta: Record<string, unknown> | null;
}

const VALID_DATING_BASES = new Set([
  'narrative',
  'traditional',
  'composition',
  'scholarly-estimate'
]);

/**
 * A quoted span: an opening mark at a word boundary, closed at a word boundary.
 * Possessive apostrophes (a letter on both sides) do not match.
 *
 * The NRSV is under copyright and passage text is displayed only through
 * BibleGateway, so authored descriptions must never reproduce the translation.
 * See docs/extraction.md.
 */
const QUOTED_SPAN = /(?:^|[\s(])["“‘'](\S[^"“”‘']*?)["”’'](?=$|[\s.,;:!?)])/g;

function quotedSpans(text: string): string[] {
  return [...text.matchAll(QUOTED_SPAN)].map((match) => match[1]);
}

export function loadBookFile(path: string): BookFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`${path}: not valid JSON — ${(error as Error).message}`);
  }

  const file = parsed as BookFile;
  if (!file || typeof file.book !== 'string' || !file.book) {
    throw new Error(`${path}: missing "book"`);
  }
  if (typeof file.order !== 'number') throw new Error(`${path}: missing numeric "order"`);
  if (!Array.isArray(file.events)) throw new Error(`${path}: missing "events" array`);

  return file;
}

/**
 * Validates a book file and resolves its dates. Returns the resolved events
 * plus any problems found; the caller decides whether to fail the build.
 */
export function resolveBook(file: BookFile, path: string) {
  const errors: string[] = [];
  const resolved: ResolvedEvent[] = [];
  const seen = new Set<string>();

  file.events.forEach((event, index) => {
    const where = `${path} [${index}] ${event?.id ?? '<no id>'}`;

    if (!event?.id || typeof event.id !== 'string') {
      errors.push(`${where}: missing "id"`);
      return;
    }
    if (seen.has(event.id)) errors.push(`${where}: duplicate id within file`);
    seen.add(event.id);

    if (!event.title) errors.push(`${where}: missing "title"`);
    if (event.datingBasis && !VALID_DATING_BASES.has(event.datingBasis)) {
      errors.push(`${where}: unknown datingBasis "${event.datingBasis}"`);
    }

    for (const [field, text] of [
      ['title', event.title],
      ['description', event.description]
    ] as const) {
      for (const span of quotedSpans(text ?? '')) {
        errors.push(
          `${where}: ${field} quotes the translation ("${span.slice(0, 48)}") — ` +
            `use reported speech instead (docs/extraction.md)`
        );
      }
    }

    let start: number;
    let precision: Precision;
    try {
      ({ ms: start, precision } = parseDate(event.start));
    } catch (error) {
      errors.push(`${where}: ${(error as Error).message}`);
      return;
    }

    let end: number | null = null;
    if (event.end !== undefined) {
      try {
        end = parseDate(event.end).ms;
      } catch (error) {
        errors.push(`${where}: ${(error as Error).message}`);
        return;
      }
      if (end < start) errors.push(`${where}: end (${event.end}) precedes start (${event.start})`);
    }

    // The UI reads meta.reference and meta.description.
    const meta: Record<string, unknown> = { precision };
    if (event.reference) meta.reference = event.reference;
    if (event.description) meta.description = event.description;
    if (event.datingBasis) meta.datingBasis = event.datingBasis;

    resolved.push({
      id: event.id,
      title: event.title,
      start,
      end,
      book: file.book,
      category: event.category ?? null,
      lane: event.lane ?? null,
      meta
    });
  });

  return { resolved, errors };
}

/** Loads and resolves every book file in a directory, in canonical order. */
export function loadAllBooks(dir: string) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  const books: { file: BookFile; events: ResolvedEvent[] }[] = [];
  const errors: string[] = [];
  const globalIds = new Map<string, string>();

  for (const name of files) {
    const path = join(dir, name);
    const file = loadBookFile(path);
    const { resolved, errors: bookErrors } = resolveBook(file, name);
    errors.push(...bookErrors);

    for (const event of resolved) {
      const previous = globalIds.get(event.id);
      if (previous) errors.push(`${name}: id "${event.id}" already used in ${previous}`);
      globalIds.set(event.id, name);
    }

    books.push({ file, events: resolved });
  }

  books.sort((a, b) => a.file.order - b.file.order);
  return { books, errors };
}
