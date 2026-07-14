import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getFlashcards, saveFlashcards } from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import { generateFlashcards, type Flashcards } from "@/lib/teach/flashcards";

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

  let deck = regenerate ? null : await getFlashcards<Flashcards>(courseId, topicId);
  if (!deck || deck.cards.length === 0) {
    const sources = await gatherSourceText(course, loc.topic);
    deck = await generateFlashcards(
      { topic: loc.topic, chapterTitle: loc.chapterTitle, sources },
      { provider: user.settings.provider, model: user.settings.model }
    );
    await saveFlashcards(courseId, topicId, deck);
  }

  return ok({ topicTitle: loc.topic.title, cards: deck.cards });
});
