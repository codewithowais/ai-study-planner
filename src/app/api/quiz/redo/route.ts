import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getProgress, savePendingQuiz } from "@/lib/store/repositories";
import { locateTopic } from "@/lib/teach/context";
import type { PendingQuiz } from "@/lib/quiz/scoring";

const schema = z.object({ courseId: z.string(), topicId: z.string() });

// Re-serve the exact questions the student got wrong last time.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  const progress = await getProgress(courseId);
  const wrong = progress?.topics[topicId]?.lastWrongQuestions ?? [];
  if (wrong.length === 0) {
    return fail("Nothing to redo — you didn't miss any questions.", 400);
  }

  const attemptId = nanoid();
  const pending: PendingQuiz = {
    attemptId,
    userId: user.id,
    courseId,
    topicId,
    kind: "topic",
    createdAt: new Date().toISOString(),
    questions: wrong,
  };
  await savePendingQuiz(attemptId, pending);

  const nextTopicId =
    loc.index < loc.order.length - 1 ? loc.order[loc.index + 1] : null;

  return ok({
    attemptId,
    topicTitle: loc.topic.title,
    nextTopicId,
    questions: wrong.map((q) => ({ id: q.id, prompt: q.prompt, choices: q.choices })),
  });
});
