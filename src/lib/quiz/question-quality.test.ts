import test from "node:test";
import assert from "node:assert/strict";

import {
  parseQuestionSet,
  questionSetSchema,
  toQuizQuestion,
} from "./question-quality.ts";

const question = {
  prompt: "Which statement best explains the difference between a tax and a fee?",
  choices: [
    "A tax is compulsory while a fee provides a specific counter-benefit.",
    "A fee is always compulsory.",
    "Taxes are paid only by companies.",
    "There is no difference.",
  ],
  correctIndex: 0,
  explanation:
    "A tax is compulsory without a direct return, while a fee pays for a specific service.",
  sourcePage: 1,
};

test("question sets require the requested number of complete questions", () => {
  assert.throws(() => questionSetSchema(5).parse({ questions: [question] }));
  assert.doesNotThrow(() =>
    questionSetSchema(2).parse({
      questions: [question, { ...question, prompt: `${question.prompt} Apply it.` }],
    })
  );
});

test("salvage keeps a near-perfect set instead of discarding it", () => {
  const good = Array.from({ length: 9 }, (_, i) => ({
    ...question,
    prompt: `${question.prompt} Variant ${i}.`,
  }));
  const bad = { ...question, prompt: "Broken one.", explanation: "Because." };
  // 9 good + 1 bad out of 10 requested → keep the 9 instead of throwing.
  const kept = parseQuestionSet({ questions: [...good, bad] }, 10);
  assert.equal(kept.length, 9);
  // Duplicate prompts are dropped, not fatal.
  const withDupe = parseQuestionSet(
    { questions: [...good, { ...good[0] }] },
    10
  );
  assert.equal(withDupe.length, 9);
  // But a mostly-broken set still fails, triggering the quality retry.
  assert.throws(() => parseQuestionSet({ questions: [bad, bad, bad] }, 10));
});

test("drafts map to stored quiz questions with ids and source refs", () => {
  const mapped = toQuizQuestion(question);
  assert.equal(mapped.id.length, 8);
  assert.equal(mapped.prompt, question.prompt);
  // Choices are deliberately SHUFFLED; same set, and the remapped index must
  // still point at the original correct answer.
  assert.deepEqual([...mapped.choices].sort(), [...question.choices].sort());
  assert.equal(
    mapped.choices[mapped.correctIndex],
    question.choices[question.correctIndex]
  );
  assert.equal(mapped.explanation, question.explanation);
  assert.deepEqual(mapped.source, { file: "", page: 1, snippet: "" });

  // No source page → no source ref, and every question gets a fresh id.
  const { sourcePage: _sourcePage, ...rest } = question;
  const unsourced = toQuizQuestion(rest);
  assert.equal(unsourced.source, undefined);
  assert.notEqual(unsourced.id, mapped.id);
});

test("toQuizQuestion shuffles choices and keeps correctIndex pointing at the right answer", async () => {
  const { toQuizQuestion } = await import("./question-quality.ts");
  const positions = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const q = toQuizQuestion({ ...question });
    // The remapped index must always point at the original correct answer.
    assert.equal(q.choices[q.correctIndex], question.choices[question.correctIndex]);
    // Same four choices, just reordered.
    assert.deepEqual([...q.choices].sort(), [...question.choices].sort());
    positions.add(q.correctIndex);
  }
  // 60 shuffles must land the correct answer on more than one position —
  // a fixed position is exactly the always-pick-A exploit being prevented.
  assert.ok(positions.size > 1, "correct answer never moved position");
});

test("questions require four unique choices and a useful explanation", () => {
  assert.throws(() =>
    questionSetSchema(1).parse({
      questions: [{ ...question, choices: ["Same", "Same", "Other", "Last"] }],
    })
  );
  assert.throws(() =>
    questionSetSchema(1).parse({
      questions: [{ ...question, explanation: "Because." }],
    })
  );
});
