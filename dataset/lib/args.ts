/**
 * Command-line flags for the three dataset entrypoints.
 *
 * The lookup and the path rule below were written three times in three shapes
 * — build.ts in full, validate.ts by hand for `--events` alone, and
 * check-artifact.ts not at all, which is why it could only ever check the
 * default event tree. #56 unified them here; the extraction is justified by
 * that drift, not by testability (#51 ruled the dataset scripts need no
 * filesystem seam).
 *
 * `argv` is a parameter rather than a read of `process.argv` so this module is
 * an ordinary pure one: the entrypoints stay outside the coverage denominator,
 * but this file is inside it.
 */

import { resolve } from "node:path";

/** A flag the caller got wrong. Entrypoints print the message and exit 1. */
export class UsageError extends Error {}

/**
 * The value following `name` in `argv`, or `fallback` when it is absent.
 *
 * A flag given as the final argument has no value to return; rather than hand
 * back `undefined` for a caller to trip over later, refuse it here, named.
 */
export function flag(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;

  const value = argv[index + 1];
  if (value === undefined) {
    throw new UsageError(`${name} needs a value after it.`);
  }
  return value;
}

/**
 * A path flag, resolved by the rule the entrypoints share: an explicit value is
 * resolved from the **cwd**, where the caller typed it, and the default from
 * the **script's own directory**, so the script works from any cwd.
 */
export function anchoredPath(
  argv: string[],
  name: string,
  options: { scriptDir: string; fallback: string },
): string {
  const value = flag(argv, name, "");
  return value ? resolve(value) : resolve(options.scriptDir, options.fallback);
}
