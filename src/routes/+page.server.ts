import type { PageServerLoad } from './$types';
import sql from '$lib/server/db';
import type { TimelineEvent } from '$lib/timeline/types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ url }) => {
  const slug = url.searchParams.get('dataset') ?? env.DEFAULT_DATASET ?? 'genesis';

  const rows = await sql<{
    id: string;
    start_time: string;
    end_time: string | null;
    title: string;
    book: string | null;
    category: string | null;
    lane: string | null;
    meta: Record<string, unknown> | null;
  }[]>`
    SELECT e.id, e.start_time, e.end_time, e.title, e.book, e.category, e.lane, e.meta
    FROM events e
    JOIN datasets d ON d.id = e.dataset_id
    WHERE d.slug = ${slug}
    ORDER BY e.start_time
  `;

  const events: TimelineEvent[] = rows.map((row) => ({
    id: row.id,
    start: Number(row.start_time),
    end: row.end_time !== null ? Number(row.end_time) : undefined,
    title: row.title,
    book: row.book ?? undefined,
    category: row.category ?? undefined,
    lane: row.lane ?? undefined,
    meta: row.meta ?? undefined,
  }));

  return { events, datasetSlug: slug };
};
