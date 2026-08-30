import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import type { TimelineEvent } from '$lib/timeline/types';
import { env } from '$env/dynamic/private';

interface EventRow {
  id: string;
  start_time: number;
  end_time: number | null;
  title: string;
  book: string | null;
  category: string | null;
  lane: string | null;
  meta: string | null;
}

export const load: PageServerLoad = async ({ url }) => {
  const slug = url.searchParams.get('dataset') ?? env.DEFAULT_DATASET ?? 'bible';
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT e.id, e.start_time, e.end_time, e.title, e.book, e.category, e.lane, e.meta
       FROM events e
       JOIN datasets d ON d.id = e.dataset_id
       WHERE d.slug = ?
       ORDER BY e.start_time`
    )
    .all(slug) as unknown as EventRow[];

  const events: TimelineEvent[] = rows.map((row) => ({
    id: row.id,
    start: Number(row.start_time),
    end: row.end_time !== null ? Number(row.end_time) : undefined,
    title: row.title,
    book: row.book ?? undefined,
    category: row.category ?? undefined,
    lane: row.lane ?? undefined,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : undefined
  }));

  const books = db
    .prepare(
      `SELECT b.name, b.event_count
       FROM books b
       JOIN datasets d ON d.id = b.dataset_id
       WHERE d.slug = ?
       ORDER BY b.book_order`
    )
    .all(slug) as unknown as { name: string; event_count: number }[];

  return {
    events,
    datasetSlug: slug,
    books: books.map((book) => ({ name: book.name, eventCount: book.event_count }))
  };
};
