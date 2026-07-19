import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGenerationFingerprint,
  createGeneratedCache,
  getOrGenerateCached,
  readGeneratedCache,
} from "./cache-key.ts";
import { runGenerationOnce } from "./generation-lock.ts";

const baseInput = {
  feature: "lesson",
  promptVersion: 2,
  provider: "claude",
  model: "sonnet",
  level: "beginner",
  depth: "default",
  topic: {
    title: "Taxable income",
    subtopics: ["Allowable deductions"],
    sources: [{ file: "FIN623.pdf", page: 12, snippet: "taxable income" }],
  },
  sources: [{ file: "FIN623.pdf", page: 12, text: "Source truth" }],
};

test("fingerprints are stable when object key insertion order changes", () => {
  const first = buildGenerationFingerprint(baseInput);
  const second = buildGenerationFingerprint({
    sources: baseInput.sources,
    topic: baseInput.topic,
    depth: baseInput.depth,
    level: baseInput.level,
    model: baseInput.model,
    provider: baseInput.provider,
    promptVersion: baseInput.promptVersion,
    feature: baseInput.feature,
  });

  assert.equal(first, second);
});

test("source, model, level, depth, and prompt changes invalidate a cache key", () => {
  const original = buildGenerationFingerprint(baseInput);
  const changes = [
    { ...baseInput, sources: [{ ...baseInput.sources[0], text: "Changed truth" }] },
    { ...baseInput, model: "haiku" },
    { ...baseInput, level: "advanced" },
    { ...baseInput, depth: "deeper" },
    { ...baseInput, promptVersion: 3 },
  ];

  for (const changed of changes) {
    assert.notEqual(buildGenerationFingerprint(changed), original);
  }
});

test("cache envelopes return values only for an exact current fingerprint", () => {
  const fingerprint = buildGenerationFingerprint(baseInput);
  const cache = createGeneratedCache(fingerprint, { intro: "Hello" }, "2026-07-14T00:00:00.000Z");

  assert.deepEqual(readGeneratedCache(cache, fingerprint), { intro: "Hello" });
  assert.equal(readGeneratedCache(cache, "stale"), null);
  // Pre-envelope cache files (bare payloads) are still valid generated
  // content — serve them instead of re-billing the student's whole library.
  assert.deepEqual(readGeneratedCache({ intro: "legacy cache" }, fingerprint), {
    intro: "legacy cache",
  });
});

test("a cache hit is served without generating or saving", async () => {
  const fingerprint = buildGenerationFingerprint(baseInput);
  let generated = 0;
  let saved = 0;

  const value = await getOrGenerateCached<{ intro: string }>({
    fingerprintInput: baseInput,
    read: () => createGeneratedCache(fingerprint, { intro: "cached" }),
    save: async () => {
      saved++;
    },
    generate: async () => {
      generated++;
      return { intro: "fresh" };
    },
  });

  assert.deepEqual(value, { intro: "cached" });
  assert.equal(generated, 0);
  assert.equal(saved, 0);
});

test("a cache miss generates once and persists the new envelope", async () => {
  const savedCaches: Array<{ fingerprint: string; value: unknown }> = [];
  const value = await getOrGenerateCached<{ intro: string }>({
    fingerprintInput: { ...baseInput, feature: "cache-miss-case" },
    read: () => null, // e.g. regenerate requested, or nothing stored yet
    save: async (cache) => {
      savedCaches.push({ fingerprint: cache.fingerprint, value: cache.value });
    },
    generate: async () => ({ intro: "fresh" }),
  });

  assert.deepEqual(value, { intro: "fresh" });
  assert.equal(savedCaches.length, 1);
  assert.deepEqual(savedCaches[0], {
    fingerprint: buildGenerationFingerprint({
      ...baseInput,
      feature: "cache-miss-case",
    }),
    value: { intro: "fresh" },
  });
});

test("a stale cache hit is regenerated instead of being served", async () => {
  const input = { ...baseInput, feature: "stale-case" };
  const fingerprint = buildGenerationFingerprint(input);
  let generated = 0;

  const value = await getOrGenerateCached<{ cards: string[] }>({
    fingerprintInput: input,
    read: () => createGeneratedCache(fingerprint, { cards: [] }),
    save: async () => {},
    isStale: (cached) => cached.cards.length === 0,
    generate: async () => {
      generated++;
      return { cards: ["fresh card"] };
    },
  });

  assert.deepEqual(value, { cards: ["fresh card"] });
  assert.equal(generated, 1);
});

test("concurrent requests with the same fingerprint share one generation", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const factory = async () => {
    calls++;
    await gate;
    return { lesson: "shared" };
  };

  const first = runGenerationOnce("lesson:abc", factory);
  const second = runGenerationOnce("lesson:abc", factory);
  release();

  assert.equal(calls, 1);
  assert.deepEqual(await first, { lesson: "shared" });
  assert.equal(await first, await second);
});

test("failed generations release the lock so retry can run", async () => {
  await assert.rejects(
    runGenerationOnce("summary:retry", async () => {
      throw new Error("temporary failure");
    })
  );

  assert.equal(
    await runGenerationOnce("summary:retry", async () => "recovered"),
    "recovered"
  );
});
