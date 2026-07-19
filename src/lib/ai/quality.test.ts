import test from "node:test";
import assert from "node:assert/strict";

import {
  AiQualityError,
  withQualityRetry,
} from "./quality.ts";

test("a valid response is returned without spending a repair call", async () => {
  const calls: Array<{ prompt: string; feature: string }> = [];
  const result = await withQualityRetry({
    feature: "lesson",
    system: "test system prompt",
    prompt: "original prompt",
    runText: async (input) => {
      calls.push(input);
      return '{"complete":true}';
    },
    parse: (text) => JSON.parse(text) as { complete: boolean },
  });

  assert.deepEqual(result, { complete: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].feature, "lesson");
});

test("an incomplete response receives one explicit quality repair attempt", async () => {
  const calls: Array<{ prompt: string; feature: string }> = [];
  const result = await withQualityRetry({
    feature: "summary",
    system: "test system prompt",
    prompt: "source-grounded prompt",
    runText: async (input) => {
      calls.push(input);
      return calls.length === 1 ? '{"points":[]}' : '{"points":["a","b","c","d"]}';
    },
    parse: (text) => {
      const parsed = JSON.parse(text) as { points: string[] };
      if (parsed.points.length < 4) throw new Error("too few points");
      return parsed;
    },
  });

  assert.deepEqual(result.points, ["a", "b", "c", "d"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].feature, "summary-retry");
  assert.match(calls[1].prompt, /QUALITY_REPAIR/);
  assert.match(calls[1].prompt, /Do not shorten the response to save tokens/);
});

test("two incomplete responses fail instead of exposing low-quality content", async () => {
  let calls = 0;
  await assert.rejects(
    withQualityRetry({
      feature: "flashcards",
      system: "test system prompt",
      prompt: "prompt",
      runText: async () => {
        calls++;
        return '{"cards":[]}';
      },
      parse: () => {
        throw new Error("not enough cards");
      },
    }),
    AiQualityError
  );
  assert.equal(calls, 2);
});

test("provider failures propagate without an expensive blind retry", async () => {
  let calls = 0;
  await assert.rejects(
    withQualityRetry({
      feature: "lesson",
      system: "test system prompt",
      prompt: "prompt",
      runText: async () => {
        calls++;
        throw new Error("provider offline");
      },
      parse: JSON.parse,
    }),
    /provider offline/
  );
  assert.equal(calls, 1);
});
