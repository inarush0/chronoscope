#!/usr/bin/env node
/**
 * Builds the shipped dataset JSON from the authored event files.
 *
 * Usage:
 *   npm run build-db [--out static/chronoscope.json] [--events dataset/events]
 *
 * The output is a committed artifact, not a throwaway: the browser fetches it
 * at a fixed URL and CI fails if it drifts from the event files. Rebuild and
 * commit the result whenever an event file changes — see check-artifact.ts.
 *
 * It lives in `static/` rather than beside this script because that is Vite's
 * `publicDir`: the dataset is a served asset now, and landing there is what
 * puts it in `dist/` for `//go:embed`. One committed copy, no copy step.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BuildError,
  buildArtifact,
  serializeArtifact,
} from "./lib/artifact.ts";

const args = process.argv.slice(2);
const getFlag = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

// Defaults are anchored to this file so the script works from any cwd; an
// explicit flag is resolved from the cwd, where the caller typed it.
const anchored = (flag: string, fallback: string) => {
  const value = getFlag(flag, "");
  return value ? resolve(value) : resolve(import.meta.dirname, fallback);
};

const eventsDir = anchored("--events", "events");
const outPath = anchored("--out", "../static/chronoscope.json");
const datasetSlug = getFlag("--slug", "bible");

let built;
try {
  built = buildArtifact({ eventsDir, datasetSlug });
} catch (error) {
  if (error instanceof BuildError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const { artifact, books, spread } = built;
const json = serializeArtifact(artifact);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

console.log(`Built ${outPath} (${(json.length / 1024).toFixed(0)}KB)`);
console.log(`  dataset: ${datasetSlug}`);
console.log(`  books:   ${books.length}`);
console.log(
  `  events:  ${artifact.events.length} (${spread} spread within their authored year or month)`,
);
for (const { file, events } of books) {
  console.log(
    `    ${String(file.order).padStart(2)} ${file.book.padEnd(24)} ${events.length}`,
  );
}
