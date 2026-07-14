import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, updateProgress } from "@/lib/store/repositories";
import { locateTopic } from "@/lib/teach/context";
import { computeNextReview } from "@/lib/quiz/scoring";
import type { CourseProgress } from "@/lib/types";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  gotIt: z.number().int().min(0),
  total: z.number().int().min(1),
});

// A finished flashcard session counts toward spaced repetition: strong recall
// pushes the next review out, weak recall brings it back sooner.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, gotIt, total } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  if (!locateTopic(course, topicId)) return fail("Topic not found.", 404);

  const recall = Math.round((gotIt / total) * 100);

  const fallback: CourseProgress = {
    courseId,
    userId: user.id,
    topics: {},
    updatedAt: new Date().toISOString(),
    mockAttempts: [],
  };

  await updateProgress(courseId, fallback, (p) => {
    const entry = p.topics[topicId] ?? {
      topicId,
      status: "not_started" as const,
      bookmarked: false,
      notes: "",
      scores: [],
    };
    // Engaging with flashcards counts as active learning (never downgrades).
    if (entry.status === "not_started") entry.status = "learning";
    const { interval, nextReviewAt } = computeNextReview(recall, entry.reviewInterval);
    entry.reviewInterval = interval;
    entry.nextReviewAt = nextReviewAt;
    entry.lastVisited = new Date().toISOString();
    p.topics[topicId] = entry;
    p.updatedAt = new Date().toISOString();
    return p;
  });

  return ok({ recall });
});
