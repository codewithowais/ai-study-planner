import { z } from "zod";

const useful = (minimum: number) => z.string().trim().min(minimum);

export const lessonSchema = z.object({
  intro: useful(40),
  sections: z
    .array(
      z.object({
        heading: useful(3),
        content: useful(80),
        pages: z.array(z.number().int().positive()).default([]),
      })
    )
    .min(1),
  keyDefinitions: z
    .array(z.object({ term: useful(2), definition: useful(15) }))
    .default([]),
  examples: z
    .array(z.object({ title: useful(2), content: useful(40) }))
    .min(1),
  examTips: z.array(useful(10)).min(1),
  // Active-recall prompts the student answers BEFORE the quiz. Best-effort
  // (default []): never block/retry a lesson just because it lacks them.
  selfCheck: z
    .array(z.object({ question: useful(8), answer: useful(8) }))
    .default([]),
  citations: z
    .array(z.object({ page: z.number().int().positive(), snippet: useful(3) }))
    .default([]),
});

export type Lesson = z.infer<typeof lessonSchema>;

export const summarySchema = z.object({
  tldr: useful(40),
  keyPoints: z.array(useful(10)).min(4).max(10),
  keyTerms: z
    .array(z.object({ term: useful(2), definition: useful(12) }))
    .default([]),
});

export type Summary = z.infer<typeof summarySchema>;

export const flashcardsSchema = z
  .object({
    cards: z
      .array(z.object({ front: useful(8), back: useful(15) }))
      .min(6)
      .max(10),
  })
  .superRefine((deck, ctx) => {
    const fronts = deck.cards.map((card) => card.front.toLowerCase());
    if (new Set(fronts).size !== fronts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flashcard prompts must be unique.",
        path: ["cards"],
      });
    }
  });

export type Flashcards = z.infer<typeof flashcardsSchema>;

/**
 * Numbered exercises/examples present in source pages ("Exercise 3",
 * "Example 8.36", "Question - 2"). Generated lessons MUST address every one
 * of them by number — enforced deterministically at parse time, not just
 * requested in the prompt.
 */
export function requiredExerciseLabels(
  sources: { text: string }[]
): { kind: string; number: string }[] {
  const seen = new Map<string, { kind: string; number: string }>();
  for (const s of sources) {
    for (const m of s.text.matchAll(
      /\b(exercise|example|question|problem)\s*[-–—]?\s*(\d+(?:\.\d+)?)\b/gi
    )) {
      const kind = m[1].toLowerCase();
      const number = m[2];
      seen.set(`${kind} ${number}`, { kind, number });
    }
  }
  return [...seen.values()];
}

/** Which required labels are missing from the generated lesson text. */
export function missingExerciseLabels(
  lesson: Lesson,
  required: { kind: string; number: string }[]
): string[] {
  const text = [
    lesson.intro,
    ...lesson.sections.map((s) => `${s.heading}\n${s.content}`),
    ...lesson.examples.map((e) => `${e.title}\n${e.content}`),
    ...lesson.examTips,
  ]
    .join("\n")
    .toLowerCase();
  return required
    .filter(({ kind, number }) => {
      const num = number.replace(/\./g, "\\.");
      return !new RegExp(`${kind}\\s*[-–—#:]?\\s*${num}\\b`, "i").test(text);
    })
    .map(({ kind, number }) => `${kind} ${number}`);
}

/**
 * Build the citation list from the pages the model grounded its sections in,
 * pulling a short real snippet from the source text for each. This replaces
 * asking the model to hand-write citations (saves output tokens + latency)
 * and is more accurate (verbatim source, not a paraphrase).
 */
export function deriveCitations(
  lesson: Lesson,
  sources: { page: number; text: string }[]
): { page: number; snippet: string }[] {
  const byPage = new Map(sources.map((s) => [s.page, s.text]));
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const section of lesson.sections) {
    for (const p of section.pages) {
      if (byPage.has(p) && !seen.has(p)) {
        seen.add(p);
        pages.push(p);
      }
    }
  }
  return pages.slice(0, 8).map((page) => {
    const words = (byPage.get(page) ?? "").replace(/\s+/g, " ").trim().split(" ");
    const snippet = words.slice(0, 12).join(" ");
    return { page, snippet: snippet || `page ${page}` };
  });
}
