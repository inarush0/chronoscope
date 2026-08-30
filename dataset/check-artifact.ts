#!/usr/bin/env bun
/**
 * Fails if the committed dataset has drifted from the authored event files.
 *
 * Usage:
 *   bun run check:artifact
 *
 * Rebuilds to a temporary file and compares against the committed one. The
 * comparison is on schema and rows rather than bytes: SQLite's on-disk encoding
 * varies between bun versions, so two builds of identical data are logically
 * equal but not byte-equal. Hashing the file would fail on a bun upgrade and
 * tell us nothing about the data.
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const committed = resolve(import.meta.dir, 'chronoscope.sqlite');
const scratch = mkdtempSync(join(tmpdir(), 'chronoscope-check-'));
const rebuilt = join(scratch, 'rebuilt.sqlite');

try {
  const build = Bun.spawnSync(['bun', resolve(import.meta.dir, 'build.ts'), '--out', rebuilt], {
    stdout: 'pipe',
    stderr: 'inherit'
  });
  if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

  if (fingerprint(committed) === fingerprint(rebuilt)) {
    console.log('dataset/chronoscope.sqlite is up to date with dataset/events/.');
    process.exit(0);
  }

  console.error(
    'dataset/chronoscope.sqlite is out of date with dataset/events/.\n' +
      "Run 'bun run build-db' and commit the result."
  );
  process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

/** Schema and rows, in a stable order, as a comparable string. */
function fingerprint(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    const objects = db
      .query('SELECT name, type, sql FROM sqlite_master ORDER BY name')
      .all() as { name: string; type: string; sql: string | null }[];

    return JSON.stringify(
      objects.map((object) => [
        object.name,
        object.type,
        object.sql,
        // Row order is not guaranteed by SQLite, so sort by the full row.
        object.type === 'table'
          ? db
              .query(`SELECT * FROM "${object.name}"`)
              .all()
              .map((row) => JSON.stringify(row))
              .sort()
          : null
      ])
    );
  } finally {
    db.close();
  }
}
