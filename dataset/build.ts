#!/usr/bin/env bun
/**
 * Builds the read-only SQLite dataset from the authored event files.
 *
 * Usage:
 *   bun scripts/build-db.ts [--out data/chronoscope.sqlite] [--events data/events]
 *
 * The output file is a build artifact: delete it and rebuild at any time.
 * It is what the app opens locally and what gets uploaded to object storage.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadAllBooks } from './lib/events.ts';

const args = process.argv.slice(2);
const getFlag = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const eventsDir = resolve(getFlag('--events', 'data/events'));
const outPath = resolve(getFlag('--out', 'data/chronoscope.sqlite'));
const datasetSlug = getFlag('--slug', 'bible');
const datasetName = getFlag('--name', 'The Bible');

const { books, errors } = loadAllBooks(eventsDir);

if (errors.length > 0) {
  console.error(`Refusing to build — ${errors.length} problem(s) in the event files:\n`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const totalEvents = books.reduce((sum, book) => sum + book.events.length, 0);
if (totalEvents === 0) {
  console.error(`No events found in ${eventsDir}`);
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
rmSync(outPath, { force: true });
rmSync(`${outPath}-journal`, { force: true });

const db = new Database(outPath, { create: true });

db.exec(`
  PRAGMA journal_mode = DELETE;

  CREATE TABLE datasets (
    id          INTEGER PRIMARY KEY,
    slug        TEXT    UNIQUE NOT NULL,
    name        TEXT    NOT NULL,
    description TEXT
  );

  CREATE TABLE events (
    id         TEXT    NOT NULL,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    start_time INTEGER NOT NULL,
    end_time   INTEGER,
    title      TEXT    NOT NULL,
    book       TEXT,
    category   TEXT,
    lane       TEXT,
    meta       TEXT,
    PRIMARY KEY (id, dataset_id)
  );

  CREATE INDEX idx_events_dataset_start ON events (dataset_id, start_time);
  CREATE INDEX idx_events_dataset_book  ON events (dataset_id, book);

  CREATE TABLE books (
    dataset_id  INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    book_order  INTEGER NOT NULL,
    testament   TEXT,
    event_count INTEGER NOT NULL,
    PRIMARY KEY (dataset_id, name)
  );
`);

const datasetId = db
  .query<{ id: number }, [string, string]>(
    'INSERT INTO datasets (slug, name) VALUES (?, ?) RETURNING id'
  )
  .get(datasetSlug, datasetName)!.id;

const insertEvent = db.prepare(
  `INSERT INTO events (id, dataset_id, start_time, end_time, title, book, category, lane, meta)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertBook = db.prepare(
  'INSERT INTO books (dataset_id, name, book_order, testament, event_count) VALUES (?, ?, ?, ?, ?)'
);

db.transaction(() => {
  for (const { file, events } of books) {
    insertBook.run(datasetId, file.book, file.order, file.testament ?? null, events.length);
    for (const event of events) {
      insertEvent.run(
        event.id,
        datasetId,
        event.start,
        event.end,
        event.title,
        event.book,
        event.category,
        event.lane,
        event.meta ? JSON.stringify(event.meta) : null
      );
    }
  }
})();

// Read-only consumers benefit from up-to-date planner statistics.
db.exec('ANALYZE');
db.exec('VACUUM');
db.close();

console.log(`Built ${outPath}`);
console.log(`  dataset: ${datasetSlug} (${datasetName})`);
console.log(`  books:   ${books.length}`);
console.log(`  events:  ${totalEvents}`);
for (const { file, events } of books) {
  console.log(`    ${String(file.order).padStart(2)} ${file.book.padEnd(24)} ${events.length}`);
}
