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
