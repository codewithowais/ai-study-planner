import test from "node:test";
import assert from "node:assert/strict";

import {
  flashcardsSchema,
  lessonSchema,
  summarySchema,
} from "./content-quality.ts";

test("incomplete lessons are rejected instead of cached", () => {
  assert.throws(() =>
    lessonSchema.parse({
      intro: "Too short",
      sections: [],
      keyDefinitions: [],
      examples: [],
      examTips: [],
      citations: [],
    })
  );
});

test("thin summaries are rejected instead of shown", () => {
  assert.throws(() =>
    summarySchema.parse({
      tldr: "Short",
      keyPoints: ["Only one point"],
      keyTerms: [],
    })
  );
});

test("bad or missing visuals/selfCheck fall back to [] instead of throwing the lesson", () => {
  const base = {
    intro:
      "This is a sufficiently long introduction to the topic for the schema to accept it.",
    sections: [
      {
        heading: "Heading",
        content:
          "This section content is long enough to satisfy the minimum length requirement of the lesson schema.",
        pages: [1],
      },
    ],
    keyDefinitions: [],
    examples: [
      { title: "Ex", content: "A worked example that is long enough to pass the minimum length." },
    ],
    examTips: ["Remember this key exam tip."],
    citations: [],
  };

  // The model may emit null, a non-array, or a malformed item for these
  // optional fields — none should throw the whole (otherwise valid) lesson.
  for (const bad of [null, {}, "nope", 42, [{ type: "bogus" }]]) {
    const lesson = lessonSchema.parse({ ...base, visuals: bad, selfCheck: bad });
    assert.deepEqual(lesson.visuals, []);
    assert.deepEqual(lesson.selfCheck, []);
  }

  // A well-formed visual still comes through.
  const ok = lessonSchema.parse({
    ...base,
    visuals: [{ type: "flow", title: "Flow", steps: [{ label: "One" }, { label: "Two" }] }],
  });
  assert.equal(ok.visuals.length, 1);
  assert.equal(ok.visuals[0].type, "flow");
});

test("flashcard decks require six useful and unique recall prompts", () => {
  const duplicate = {
    front: "What is taxable income?",
    back: "Income remaining after allowable deductions are applied.",
  };
  assert.throws(() =>
    flashcardsSchema.parse({ cards: Array.from({ length: 6 }, () => duplicate) })
  );
  assert.throws(() => flashcardsSchema.parse({ cards: [duplicate] }));
});
