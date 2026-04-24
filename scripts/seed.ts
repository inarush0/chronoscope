#!/usr/bin/env bun
/**
 * Seeds a dataset from a JSON file into the Chronoscope database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun scripts/seed.ts <json-file> <dataset-slug> <dataset-name> <book-name> [description]
 *
 * Example:
 *   DATABASE_URL=... bun scripts/seed.ts ../chronoscope/src/lib/data/genesis.json bible "The Bible" "Genesis"
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL env var is required');
  process.exit(1);
}

const [, , filePath, slug, name, book, description] = process.argv;
if (!filePath || !slug || !name || !book) {
  console.error('Usage: bun scripts/seed.ts <json-file> <dataset-slug> <dataset-name> <book-name> [description]');
  process.exit(1);
}

const data = JSON.parse(readFileSync(filePath, 'utf-8'));
const events: {
  id: string;
  start: number;
  end?: number;
  title: string;
  category?: string;
  lane?: string;
  meta?: Record<string, unknown>;
}[] = data.events;

if (!Array.isArray(events) || events.length === 0) {
  console.error('Error: JSON file must contain a non-empty "events" array');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const [dataset] = await sql`
  INSERT INTO datasets (slug, name, description)
  VALUES (${slug}, ${name}, ${description ?? null})
  ON CONFLICT (slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description
  RETURNING id
`;

let inserted = 0;
for (const event of events) {
  await sql`
    INSERT INTO events (id, dataset_id, start_time, end_time, title, book, category, lane, meta)
    VALUES (
      ${event.id},
      ${dataset.id},
      ${event.start},
      ${event.end ?? null},
      ${event.title},
      ${book},
      ${event.category ?? null},
      ${event.lane ?? null},
      ${event.meta ? sql.json(event.meta) : null}
    )
    ON CONFLICT (id, dataset_id) DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time   = EXCLUDED.end_time,
      title      = EXCLUDED.title,
      book       = EXCLUDED.book,
      category   = EXCLUDED.category,
      lane       = EXCLUDED.lane,
      meta       = EXCLUDED.meta
  `;
  inserted++;
}

await sql.end();
console.log(`Done: seeded ${inserted} events for book "${book}" in dataset "${slug}" (${name})`);
