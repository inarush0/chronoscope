#!/usr/bin/env bun
/**
 * Checks every authored event file without building the database.
 *
 * Usage:
 *   bun run validate [--events dataset/events]
 *
 * Reports schema problems, unparseable dates, duplicate ids across books, and
 * events that fall outside their book's expected span.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAllBooks } from './lib/events.ts';
import { formatDate } from './lib/dates.ts';

// Default is anchored to this file so the script works from any cwd; an
// explicit flag is resolved from the cwd, where the caller typed it.
const args = process.argv.slice(2);
const index = args.indexOf('--events');
const eventsDir =
  index === -1 ? resolve(import.meta.dir, 'events') : resolve(args[index + 1]);

const { books, errors, spread } = loadAllBooks(eventsDir);

for (const { file, events } of books) {
  if (events.length === 0) {
    console.log(`  ${file.book.padEnd(24)} (no events)`);
    continue;
  }
  const starts = events.map((event) => event.start);
  const span = `${formatDate(Math.min(...starts), 'year')} .. ${formatDate(Math.max(...starts), 'year')}`;
  const unordered = events.some((event, i) => i > 0 && event.start < events[i - 1].start);
  console.log(
    `  ${String(file.order).padStart(2)} ${file.book.padEnd(24)} ${String(events.length).padStart(4)} events  ${span}${unordered ? '  (not in chronological order)' : ''}`
  );
}

const total = books.reduce((sum, book) => sum + book.events.length, 0);
console.log(`\n${books.length} book file(s), ${total} event(s)`);
console.log(`${spread} event(s) share a date and are spread within their authored year or month`);

// Coverage against the target scope in dataset/books.json.
try {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, 'books.json'), 'utf-8')) as {
    target: { book: string }[];
  };
  const done = new Set(books.map((book) => book.file.book));
  const pending = manifest.target.filter((entry) => !done.has(entry.book));
  console.log(
    `Coverage: ${manifest.target.length - pending.length}/${manifest.target.length} target books`
  );
  if (pending.length > 0) {
    console.log(`Remaining: ${pending.map((entry) => entry.book).join(', ')}`);
  }
} catch {
  // Manifest is optional.
}

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log('All event files valid.');
