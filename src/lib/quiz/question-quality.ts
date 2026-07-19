import { nanoid } from "nanoid";
import { z } from "zod";
import type { QuizQuestion } from "@/lib/types";

const questionSchema = z
  .object({
    prompt: z.string().trim().min(10),
    choices: z.array(z.string().trim().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(20),
    sourcePage: z.number().int().positive().optional(),
  })
  .superRefine((question, ctx) => {
    const choices = question.choices.map((choice) => choice.toLowerCase());
    if (new Set(choices).size !== choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Answer choices must be unique.",
        path: ["choices"],
      });
    }
  });

export type QuestionDraft = z.infer<typeof questionSchema>;

export function questionSetSchema(count: number) {
  return z
    .object({ questions: z.array(questionSchema).length(count) })
    .superRefine((set, ctx) => {
      const prompts = set.questions.map((question) =>
        question.prompt.toLowerCase()
      );
      if (new Set(prompts).size !== prompts.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Question prompts must be unique.",
          path: ["questions"],
        });
      }
    });
}

/**
 * Salvage-parse a question set: validate each question individually, drop the
 * flawed ones (and duplicate prompts), and keep up to `count`. Only throws —
 * triggering the quality retry — when too few usable questions remain, so one
 * bad question never voids an otherwise good exam.
 */
export function parseQuestionSet(value: unknown, count: number): QuestionDraft[] {
  const envelope = z.object({ questions: z.array(z.unknown()) }).parse(value);
  const seenPrompts = new Set<string>();
  const usable: QuestionDraft[] = [];
  for (const raw of envelope.questions) {
    const parsed = questionSchema.safeParse(raw);
    if (!parsed.success) continue;
    const key = parsed.data.prompt.toLowerCase();
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);
    usable.push(parsed.data);
    if (usable.length >= count) break;
  }
  const minimum = Math.min(count, Math.max(3, Math.ceil(count * 0.6)));
  if (usable.length < minimum) {
    throw new Error(
      `Only ${usable.length} of ${count} questions were usable — regenerate.`
    );
  }
  return usable;
}

/**
 * Turn a validated model draft into a stored quiz question, SHUFFLING the
 * answer choices. Models cluster the correct answer at one position (observed:
 * correctIndex 0,0,0,0,0 in a single generation), so without a server-side
 * shuffle a student who always picks the same letter can score 100% and flip
 * a weak topic to "mastered" without learning anything.
 */
export function toQuizQuestion(draft: QuestionDraft): QuizQuestion {
  const order = draft.choices.map((_, i) => i);
  // Fisher–Yates
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    id: nanoid(8),
    prompt: draft.prompt,
    choices: order.map((i) => draft.choices[i]),
    correctIndex: order.indexOf(draft.correctIndex),
    explanation: draft.explanation,
    source: draft.sourcePage
      ? { file: "", page: draft.sourcePage, snippet: "" }
      : undefined,
  };
}
