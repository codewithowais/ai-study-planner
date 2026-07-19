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

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  regenerate: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 150;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, regenerate } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  const deck = await getOrGenerateCached<Flashcards>({
    fingerprintInput: {
      feature: "flashcards",
      promptVersion: FLASHCARDS_PROMPT_VERSION,
      provider: user.settings.provider,
      model: user.settings.model ?? "default",
      chapterTitle: loc.chapterTitle,
      topic: loc.topic,
      // Resources are immutable once extracted (uploads only append new
      // resource ids; pages are never mutated), so the id list stands in for
      // the full source text. A future "replace PDF" feature must mint new
      // resource ids.
      resourceIds: course.resourceIds,
    },
    read: () => (regenerate ? null : getFlashcards<unknown>(courseId, topicId)),
    save: (cache) => saveFlashcards(courseId, topicId, cache),
    // An empty cached deck is a past bad generation — treat it as a miss.
    isStale: (cached) => cached.cards.length === 0,
    // Source text is only gathered on a cache miss — hits do zero resource I/O.
    generate: async () => {
      const sources = await gatherSourceText(course, loc.topic);
      return generateFlashcards(
        { topic: loc.topic, chapterTitle: loc.chapterTitle, sources },
        { provider: user.settings.provider, model: user.settings.model }
      );
    },
    // Old cached decks predate the plain-spoken v3 standard — regenerate to the
    // current standard on next open (bare payloads aren't served).
    acceptLegacy: false,
  });

  return ok({ topicTitle: loc.topic.title, cards: deck.cards });
});
