import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The dataset is static, read-only SQLite, built from the authored event files
 * by `bun run build-db` and committed at a fixed path in this repo. There is no
 * database server and nothing to configure: the file ships with the code.
 *
 * Opening is lazy and memoized: importing this module must stay side-effect
 * free, because SvelteKit loads every `+page.server.ts` during the build.
 */

const DATASET_PATH = resolve('dataset/chronoscope.sqlite');

let database: DatabaseSync | undefined;
let watchedMtimeMs = 0;

/**
 * Opt-in, for iterating on the dataset: re-open when the file changes on disk
 * so `bun run build-db` shows up without restarting.
 */
const reloadEnabled = () => env.DATASET_RELOAD === '1' || env.DATASET_RELOAD === 'true';

export function getDb(): DatabaseSync {
  if (database && reloadEnabled()) discardIfStale();
  database ??= open();
  return database;
}

function discardIfStale(): void {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(DATASET_PATH).mtimeMs;
  } catch {
    // build-db unlinks before recreating; keep serving the open handle rather
    // than failing requests during the rebuild.
    return;
  }
  if (mtimeMs === watchedMtimeMs) return;

  const stale = database;
  database = undefined;
  // Let any in-flight request finish its queries before the handle goes away.
  setTimeout(() => {
    try {
      stale?.close();
    } catch {
      // Already closed, or never opened cleanly. Nothing to salvage.
    }
  }, 5_000).unref?.();
}

function open(): DatabaseSync {
  if (!existsSync(DATASET_PATH)) {
    throw new Error(
      `The dataset is missing from ${DATASET_PATH}. Build it with: bun run build-db`
    );
  }

  watchedMtimeMs = statSync(DATASET_PATH).mtimeMs;
  return new DatabaseSync(DATASET_PATH, { readOnly: true });
}
