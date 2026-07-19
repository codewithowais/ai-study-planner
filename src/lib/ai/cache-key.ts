import { createHash } from "node:crypto";
import { runGenerationOnce } from "./generation-lock.ts";

export interface GeneratedCache<T> {
  version: 1;
  fingerprint: string;
  createdAt: string;
  value: T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function buildGenerationFingerprint(input: unknown): string {
  const payload = JSON.stringify(stableValue(input));
  return createHash("sha256").update(payload).digest("hex");
}

export function createGeneratedCache<T>(
  fingerprint: string,
  value: T,
  createdAt = new Date().toISOString()
): GeneratedCache<T> {
  return { version: 1, fingerprint, createdAt, value };
}

export function readGeneratedCache<T>(
  raw: unknown,
  fingerprint: string,
  acceptLegacy = true
): T | null {
  if (!raw || typeof raw !== "object") return null;
  const cache = raw as Partial<GeneratedCache<T>>;
  // Legacy cache files predate the envelope (bare payloads with no version /
  // fingerprint). By default they are still served — re-billing a whole
  // library on an unrelated deploy is wasteful. But callers whose OUTPUT
  // contract changed (e.g. lessons after a teaching-quality/coverage upgrade)
  // pass acceptLegacy=false so old content is treated as a miss and lazily
  // regenerated to the new standard the next time the topic is opened.
  if (!("version" in cache) && !("fingerprint" in cache)) {
    return acceptLegacy ? (raw as T) : null;
  }
  if (cache.version !== 1 || cache.fingerprint !== fingerprint || !("value" in cache)) {
    return null;
  }
  return cache.value as T;
}

export interface GetOrGenerateCachedInput<T> {
  /** Stable inputs that define this generation (feature, prompt version, ...). */
  fingerprintInput: unknown;
  /**
   * Load the raw stored cache (envelope or legacy bare payload). Return null
   * to force a regeneration (e.g. when the caller received `regenerate`).
   */
  read: () => Promise<unknown> | unknown;
  /** Persist a freshly generated envelope. */
  save: (cache: GeneratedCache<T>) => Promise<unknown> | unknown;
  /** Produce a new value; only runs on a cache miss, deduped per fingerprint. */
  generate: () => Promise<T>;
  /** Optional extra staleness check on a cache hit (hit is discarded if true). */
  isStale?: (value: T) => boolean;
  /**
   * Whether to serve pre-envelope legacy caches (default true). Set false when
   * the output contract has changed and old content should be regenerated to
   * the new standard on next access.
   */
  acceptLegacy?: boolean;
}

/**
 * The one shared cache orchestration for generated study content:
 * fingerprint the inputs, serve a valid cached value, otherwise generate
 * exactly once per fingerprint (in-process) and persist the envelope.
 *
 * Cache hits return before `generate` runs, so callers can (and should)
 * defer expensive input gathering — like reading resource source text —
 * into the `generate` closure.
 */
export async function getOrGenerateCached<T>({
  fingerprintInput,
  read,
  save,
  generate,
  isStale,
  acceptLegacy = true,
}: GetOrGenerateCachedInput<T>): Promise<T> {
  const fingerprint = buildGenerationFingerprint(fingerprintInput);
  const cached = readGeneratedCache<T>(await read(), fingerprint, acceptLegacy);
  if (cached !== null && !isStale?.(cached)) return cached;

  // The lock covers generate AND save: if it released after generate alone, a
  // caller landing between lock release and save completion would miss both
  // the lock and the cache and start a duplicate paid generation. Joiners
  // share the same promise, so the envelope is persisted exactly once.
  return runGenerationOnce(fingerprint, async () => {
    const value = await generate();
    await save(createGeneratedCache(fingerprint, value));
    return value;
  });
}
