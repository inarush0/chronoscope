#!/usr/bin/env node
/**
 * Fails if the committed dataset has drifted from the authored event files.
 *
 * Usage:
 *   npm run check:artifact [--events dataset/events]
 *
 * Rebuilds in memory and compares strings. When the artifact was SQLite this
 * had to spawn a build and compare schema and rows, because SQLite's on-disk
 * encoding varied between runtime versions and identical data produced
 * different bytes. JSON has no such freedom: same events in, same bytes out.
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { UsageError, anchoredPath } from "./lib/args.ts";
import {
  BuildError,
  buildArtifact,
  serializeArtifact,
} from "./lib/artifact.ts";

const args = process.argv.slice(2);
const scriptDir = import.meta.dirname;

// `--events` falls out of the shared resolution rule for free, and without it
// there is no way to check an artifact built from anywhere but the default
// tree. The committed path stays a constant: it is the shipped artifact.
let eventsDir: string;
try {
  eventsDir = anchoredPath(args, "--events", { scriptDir, fallback: "events" });
} catch (error) {
  if (error instanceof UsageError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const committedPath = resolve(scriptDir, "../static/chronoscope.json");

// The messages below name the tree that was actually read, so `--events` can't
// report a mismatch against a directory it never opened. Inside the repo that
// prints the familiar `dataset/events`; anywhere else, the absolute path.
const repoRoot = resolve(scriptDir, "..");
const fromRoot = relative(repoRoot, eventsDir);
const eventsLabel = fromRoot.startsWith("..") ? eventsDir : fromRoot;

let expected: string;
try {
  const { artifact } = buildArtifact({
    eventsDir,
    datasetSlug: "bible",
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
  committed = readFileSync(committedPath, "utf-8");
} catch {
  console.error(
    `static/chronoscope.json is missing.\nRun 'npm run build-db' and commit the result.`,
  );
  process.exit(1);
}

if (committed === expected) {
  console.log(`static/chronoscope.json is up to date with ${eventsLabel}/.`);
  process.exit(0);
}

console.error(
  `static/chronoscope.json is out of date with ${eventsLabel}/.\n` +
    `Run 'npm run build-db' and commit the result.`,
);
process.exit(1);
