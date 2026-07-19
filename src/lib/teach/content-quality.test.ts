import test from "node:test";
import assert from "node:assert/strict";

import {
  flashcardsSchema,
  lessonSchema,
  parseFlashcardDeck,
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

test("flashcard salvage drops duplicate/invalid cards instead of rejecting the deck", () => {
  const deck = parseFlashcardDeck({
    cards: [
      { front: "What is taxable income?", back: "Income left after allowable deductions are applied." },
      { front: "What is taxable income?", back: "A duplicate front — should be dropped." },
      { front: "bad", back: "This card's front is too short and should be dropped." },
      { front: "Name the canons of taxation", back: "Simplicity, certainty, convenience, and ability to pay." },
      { front: "What is a tax year?", back: "The twelve-month period income is assessed over." },
      { front: "What is fiscal policy?", back: "How government uses tax and spending to steer the economy." },
      { front: "What is a fee?", back: "A charge paid for a specific service you receive back." },
    ],
  });
  const fronts = deck.cards.map((c) => c.front);
  assert.equal(new Set(fronts).size, fronts.length); // no duplicate fronts survived
  assert.ok(deck.cards.length >= 5); // enough salvaged
  assert.ok(!fronts.includes("bad")); // the too-short card was dropped
});

test("flashcard salvage still throws when too few usable cards remain", () => {
  assert.throws(() =>
    parseFlashcardDeck({
      cards: [{ front: "Only one good card here", back: "Not enough to make a full deck." }],
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
