import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTutorPrompt,
  prepareTutorContext,
  type TutorMessageLike,
} from "./chat-memory.ts";

function message(index: number, role: "user" | "assistant", content?: string) {
  return {
    id: String(index),
    role,
    content: content ?? `${role} message ${index}`,
    createdAt: `2026-07-14T00:00:${String(index).padStart(2, "0")}.000Z`,
  } satisfies TutorMessageLike;
}

test("keeps recent turns exact and compacts older turns deterministically", () => {
  const messages = [
    message(1, "user", "What is taxable income?"),
    message(2, "assistant", "Taxable income is income after permitted deductions (p.12)."),
    message(3, "user", "Which deductions matter?"),
    message(4, "assistant", "The material lists business deductions on page 14."),
    message(5, "user"),
    message(6, "assistant"),
    message(7, "user"),
    message(8, "assistant"),
  ];

  const result = prepareTutorContext(messages, {
    recentMessageLimit: 4,
    recentCharBudget: 1_000,
    memoryCharBudget: 1_000,
  });

  assert.deepEqual(result.recentMessages.map((item) => item.id), ["5", "6", "7", "8"]);
  assert.equal(
    result.recentTranscript,
    "Student: user message 5\n\nTutor: assistant message 6\n\nStudent: user message 7\n\nTutor: assistant message 8"
  );
  assert.match(result.compactMemory, /Student asked: What is taxable income\?/);
  assert.match(result.compactMemory, /Tutor explained: Taxable income.*\(p\.12\)/);
  assert.match(result.compactMemory, /Student asked: Which deductions matter\?/);
});

test("enforces memory and recent prompt budgets while retaining the latest question", () => {
  const messages = Array.from({ length: 20 }, (_, index) =>
    message(index, index % 2 ? "assistant" : "user", `message-${index} ${"x".repeat(500)}`)
  );

  const result = prepareTutorContext(messages, {
    recentMessageLimit: 6,
    recentCharBudget: 500,
    memoryCharBudget: 300,
  });

  assert.ok(result.recentTranscript.length <= 500);
  assert.ok(result.compactMemory.length <= 300);
  assert.match(result.recentTranscript, /message-19/);
});

test("places immutable source context before changing conversation context", () => {
  const prompt = buildTutorPrompt({
    topicTitle: "Taxable income",
    chapterTitle: "Income tax",
    material: "[[FIN623.pdf · PAGE 12]]\nSource truth",
    compactMemory: "Student previously confused gross and taxable income.",
    recentTranscript: "Student: Explain the difference.",
  });

  assert.ok(prompt.indexOf("<UNTRUSTED_MATERIAL>") < prompt.indexOf("Prior tutor memory:"));
  assert.ok(prompt.indexOf("Prior tutor memory:") < prompt.indexOf("Recent conversation:"));
  assert.match(prompt, /Answer the student's latest message/);
});

test("retrieves an old relevant exchange when a long chat exceeds the memory budget", () => {
  const messages = [
    message(0, "user", "I keep confusing capital allowance with an ordinary expense."),
    message(1, "assistant", "Capital allowance follows a separate tax rule and is not an ordinary expense."),
    ...Array.from({ length: 12 }, (_, index) =>
      message(
        index + 2,
        index % 2 ? "assistant" : "user",
        `Unrelated discussion about filing deadline number ${index}.`
      )
    ),
    message(14, "user", "Remind me why capital allowance is not an ordinary expense."),
  ];

  const result = prepareTutorContext(messages, {
    recentMessageLimit: 1,
    recentCharBudget: 500,
    memoryCharBudget: 220,
  });

  assert.match(result.compactMemory, /confusing capital allowance/i);
  assert.match(result.compactMemory, /separate tax rule/i);
  assert.doesNotMatch(result.compactMemory, /deadline number 11/i);
});
