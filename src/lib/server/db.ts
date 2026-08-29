import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The dataset is static, read-only SQLite built by chronoscope-infra.
 *
 * It is sourced either from a local file (DATABASE_FILE) or fetched once from
 * object storage (DATABASE_URL) and cached on local disk, so a hosted instance
 * needs no database server.
 *
 * Opening is lazy and memoized: importing this module must stay side-effect
 * free, because SvelteKit loads every `+page.server.ts` during the build.
 */

let database: Promise<DatabaseSync> | undefined;
let watchedPath: string | undefined;
let watchedMtimeMs = 0;

/**
 * Opt-in, for iterating on the dataset: re-open when the file changes on disk
 * so `bun run build-db` shows up without restarting. Off unless DATASET_RELOAD
 * is set, and only meaningful for DATABASE_FILE.
 */
const reloadEnabled = () => env.DATASET_RELOAD === '1' || env.DATASET_RELOAD === 'true';

export function getDb(): Promise<DatabaseSync> {
  if (database && watchedPath && reloadEnabled()) discardIfStale(watchedPath);

  database ??= open().catch((error) => {
    // Don't memoize a failure — a transient fetch error should be retryable.
    database = undefined;
    throw error;
  });
  return database;
}

function discardIfStale(path: string): void {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    // build-db unlinks before recreating; keep serving the open handle rather
    // than failing requests during the rebuild.
    return;
  }
  if (mtimeMs === watchedMtimeMs) return;

  const stale = database;
  database = undefined;
  // Let any in-flight request finish its queries before the handle goes away.
  setTimeout(() => void stale?.then((db) => db.close()).catch(() => {}), 5_000).unref?.();
}

async function open(): Promise<DatabaseSync> {
  const path = await resolveDatabasePath();

  if (env.DATABASE_FILE) {
    watchedPath = path;
    watchedMtimeMs = statSync(path).mtimeMs;
  }

  return new DatabaseSync(path, { readOnly: true });
}

async function resolveDatabasePath(): Promise<string> {
  const file = env.DATABASE_FILE;
  if (file) {
    if (!existsSync(file)) {
      throw new Error(
        `DATABASE_FILE points at "${file}", which does not exist. ` +
          `Build it with: bun scripts/build-db.ts (in chronoscope-infra)`
      );
    }
    return file;
  }

  if (env.DATABASE_URL) return fetchToCache(env.DATABASE_URL);

  throw new Error('Set DATABASE_FILE (local path) or DATABASE_URL (object storage) ');
}

/**
 * Downloads the dataset once per URL into the cache directory. The write is
 * atomic so a torn download can never be opened as a database.
 */
async function fetchToCache(url: string): Promise<string> {
  const cacheDir = env.DATASET_CACHE_DIR || join(tmpdir(), 'chronoscope');
  const key = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const cached = join(cacheDir, `${key}.sqlite`);

  if (existsSync(cached)) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset from ${url}: ${response.status} ${response.statusText}`);
  }

  mkdirSync(cacheDir, { recursive: true });
  const pending = `${cached}.${process.pid}.partial`;
  writeFileSync(pending, Buffer.from(await response.arrayBuffer()));
  renameSync(pending, cached);

  return cached;
}
