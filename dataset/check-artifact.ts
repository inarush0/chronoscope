#!/usr/bin/env bun
/**
 * Fails if the committed dataset has drifted from the authored event files.
 *
 * Usage:
 *   bun run check:artifact
 *
 * Rebuilds in memory and compares strings. When the artifact was SQLite this
 * had to spawn a build and compare schema and rows, because SQLite's on-disk
 * encoding varied between bun versions and identical data produced different
 * bytes. JSON has no such freedom: same events in, same bytes out.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildError, buildArtifact, serializeArtifact } from './lib/artifact.ts';

const committedPath = resolve(import.meta.dirname, '../static/chronoscope.json');

let expected: string;
try {
  const { artifact } = buildArtifact({
    eventsDir: resolve(import.meta.dirname, 'events'),
    datasetSlug: 'bible'
  });
  expected = serializeArtifact(artifact);
} catch (error) {
  if (error instanceof BuildError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

let committed: string;
try {
  committed = readFileSync(committedPath, 'utf-8');
} catch {
  console.error(
    `static/chronoscope.json is missing.\nRun 'bun run build-db' and commit the result.`
  );
  process.exit(1);
}

if (committed === expected) {
  console.log('static/chronoscope.json is up to date with dataset/events/.');
  process.exit(0);
}

console.error(
  'static/chronoscope.json is out of date with dataset/events/.\n' +
    "Run 'bun run build-db' and commit the result."
);
process.exit(1);
