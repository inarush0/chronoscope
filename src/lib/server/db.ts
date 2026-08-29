import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
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

export function getDb(): Promise<DatabaseSync> {
  database ??= open().catch((error) => {
    // Don't memoize a failure — a transient fetch error should be retryable.
    database = undefined;
    throw error;
  });
  return database;
}

async function open(): Promise<DatabaseSync> {
  const path = await resolveDatabasePath();
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
