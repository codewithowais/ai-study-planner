import test from "node:test";
import assert from "node:assert/strict";

import {
  requiredExerciseLabels,
  missingExerciseLabels,
  deriveCitations,
  type Lesson,
} from "./content-quality.ts";

const SOURCES = [
  { text: "LESSON 8.36\nTaxation of Resident Company\nExercise 1\nCompute taxable income...\nExercise - 2\nAnother problem..." },
  { text: "Exercise 3\n...\nExercise – 4\n...\nSolution of exercise 3 continues" },
  { text: "LESSON 8.37\nExercise - 5\nHospital chain audit...\nExample 8.1 shows the slab." },
];

function lessonWith(text: string): Lesson {
  return {
    intro: "Let's learn this together — a friendly introduction to the topic here.",
    sections: [{ heading: "Walkthrough", content: text, pages: [73] }],
    keyDefinitions: [],
    examples: [{ title: "Worked", content: "First we compute, then we add back the disallowed items." }],
    examTips: ["Remember the add-backs."],
    selfCheck: [],
    visuals: [],
    citations: [{ page: 73, snippet: "Exercise 1" }],
  };
}

test("every numbered exercise/example in the sources is required", () => {
  const required = requiredExerciseLabels(SOURCES);
  const keys = required.map((r) => `${r.kind} ${r.number}`).sort();
  assert.deepEqual(keys, [
    "example 8.1",
    "exercise 1",
    "exercise 2",
    "exercise 3",
    "exercise 4",
    "exercise 5",
  ]);
});

test("a lesson that solves every numbered item passes; one that skips fails", () => {
  const required = requiredExerciseLabels(SOURCES);
  const complete = lessonWith(
    "Exercise 1: we solve it step by step. Exercise - 2 asks... Exercise 3 works like... " +
      "Exercise #4 is the trap one. Exercise 5 covers the hospital chain. Example 8.1 shows slabs."
  );
  assert.deepEqual(missingExerciseLabels(complete, required), []);

  const skipsTwo = lessonWith(
    "Exercise 1 solved. Exercise 3 solved. Exercise 5 solved. Example 8.1 shown."
  );
  assert.deepEqual(missingExerciseLabels(skipsTwo, required), [
    "exercise 2",
    "exercise 4",
  ]);
});

test("citations are derived from grounded section pages with real snippets", () => {
  const lesson = lessonWith("teaching text");
  lesson.sections = [
    { heading: "A", content: "…", pages: [1, 2] },
    { heading: "B", content: "…", pages: [2, 99] }, // 99 not in sources → skipped
  ];
  const sources = [
    { page: 1, text: "  Tax is a compulsory contribution of wealth levied by the state on persons and things." },
    { page: 2, text: "Fiscal policy is the government's plan for revenue and spending decisions overall." },
  ];
  const cites = deriveCitations(lesson, sources);
  assert.deepEqual(
    cites.map((c) => c.page),
    [1, 2] // deduped, in-order, unknown page 99 dropped
  );
  assert.equal(
    cites[0].snippet,
    "Tax is a compulsory contribution of wealth levied by the state on" // first 12 words, trimmed
  );
  assert.ok(cites[0].snippet.length > 0 && cites[1].snippet.length > 0);
});

test("decimal numbers match exactly, not by prefix", () => {
  const required = requiredExerciseLabels([{ text: "Example 8.1 here" }]);
  const wrong = lessonWith("Example 8.15 is different content.");
  assert.deepEqual(missingExerciseLabels(wrong, required), ["example 8.1"]);
});
