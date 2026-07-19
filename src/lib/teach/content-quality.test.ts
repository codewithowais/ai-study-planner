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
