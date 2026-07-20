import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getFlashcards, saveFlashcards } from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import {
  generateFlashcards,
  FLASHCARDS_PROMPT_VERSION,
  type Flashcards,
} from "@/lib/teach/flashcards";
import { getOrGenerateCached } from "@/lib/ai/cache-key";
import { languageVariant, languageFingerprint } from "@/lib/teach/language";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  regenerate: z.boolean().optional(),
  language: z.enum(["en", "roman-ur"]).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 150;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, regenerate, language } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  const variant = languageVariant(language);

  const deck = await getOrGenerateCached<Flashcards>({
    fingerprintInput: {
      feature: "flashcards",
      promptVersion: FLASHCARDS_PROMPT_VERSION,
      provider: user.settings.provider,
      model: user.settings.model ?? process.env.AI_MODEL ?? "default",
      chapterTitle: loc.chapterTitle,
      topic: loc.topic,
      // undefined for English → identical hash to before (no re-billing);
      // "roman-ur" → distinct fingerprint + its own generation lock.
      language: languageFingerprint(language),
      // NB: intentionally NOT course.resourceIds — that course-global list
      // would re-bill EVERY topic when any new resource is added. loc.topic
      // carries topic.sources (the only pages gatherSourceText reads), so the
      // topic alone determines the grounding text.
    },
    read: () => (regenerate ? null : getFlashcards<unknown>(courseId, topicId, variant)),
    save: (cache) => saveFlashcards(courseId, topicId, cache, variant),
    // An empty cached deck is a past bad generation — treat it as a miss.
    isStale: (cached) => cached.cards.length === 0,
    // Source text is only gathered on a cache miss — hits do zero resource I/O.
    generate: async () => {
      const sources = await gatherSourceText(course, loc.topic);
      return generateFlashcards(
        { topic: loc.topic, chapterTitle: loc.chapterTitle, sources, language },
        { provider: user.settings.provider, model: user.settings.model }
      );
    },
    // Old cached decks predate the plain-spoken v3 standard — regenerate to the
    // current standard on next open (bare payloads aren't served).
    acceptLegacy: false,
  });

  return ok({ topicTitle: loc.topic.title, cards: deck.cards });
});
