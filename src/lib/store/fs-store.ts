import { promises as fs } from "fs";
import path from "path";

/**
 * Minimal, dependency-free JSON document store.
 *
 * - All data lives under ./data (git-ignored).
 * - Writes are atomic (write to a temp file, then rename) so a crash mid-write
 *   never corrupts an existing document.
 * - A per-path promise chain serializes writes to the same file to avoid
 *   lost updates when two requests touch the same document concurrently.
 */

const DATA_DIR = path.join(process.cwd(), "data");

// Per-file write queues, keyed by absolute path.
const locks = new Map<string, Promise<unknown>>();

function abs(relPath: string): string {
  return path.join(DATA_DIR, relPath);
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Write atomically: tmp file + rename. On Windows, rename over an existing,
 * possibly-locked file (antivirus, indexer) can throw EPERM/EEXIST/EACCES —
 * fall back to removing the target and retrying, then to a direct write.
 */
async function atomicWrite(filePath: string, contents: string): Promise<void> {
  await ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, contents, "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EPERM" || code === "EACCES") {
      try {
        await fs.rm(filePath, { force: true });
        await fs.rename(tmp, filePath);
        return;
      } catch {
        // Last resort: write in place, then clean up the tmp file.
        await fs.writeFile(filePath, contents, "utf8");
        await fs.rm(tmp, { force: true }).catch(() => undefined);
        return;
      }
    }
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function readJson<T>(relPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(abs(relPath), "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson<T>(relPath: string, data: T): Promise<void> {
  const filePath = abs(relPath);
  const prev = locks.get(filePath) ?? Promise.resolve();

  const next = prev
    .catch(() => undefined) // isolate: a prior failure must not block this write
    .then(async () => {
      await atomicWrite(filePath, JSON.stringify(data, null, 2));
    });

  locks.set(filePath, next);
  try {
    await next;
  } finally {
    if (locks.get(filePath) === next) locks.delete(filePath);
  }
}

/**
 * Read-modify-write a document under a lock so concurrent updates to the same
 * file compose instead of clobbering each other.
 */
export async function updateJson<T>(
  relPath: string,
  fallback: T,
  mutate: (current: T) => T | Promise<T>
): Promise<T> {
  const filePath = abs(relPath);
  const prev = locks.get(filePath) ?? Promise.resolve();

  let result!: T;
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await readJson<T>(relPath, fallback);
      const updated = await mutate(current);
      await atomicWrite(filePath, JSON.stringify(updated, null, 2));
      result = updated;
    });

  locks.set(filePath, next);
  try {
    await next;
    return result;
  } finally {
    if (locks.get(filePath) === next) locks.delete(filePath);
  }
}

export async function listJsonIds(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(abs(dir));
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function deleteJson(relPath: string): Promise<void> {
  try {
    await fs.unlink(abs(relPath));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export { DATA_DIR };
