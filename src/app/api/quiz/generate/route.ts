import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getProgress, savePendingQuiz } from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import { generateQuiz } from "@/lib/quiz/generate";
import type { PendingQuiz } from "@/lib/quiz/scoring";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  count: z.number().int().min(3).max(10).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 200;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, count } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  // Auto-target the re-quiz on what the student missed if the topic is weak.
  const progress = await getProgress(courseId);
  const entry = progress?.topics[topicId];
  const focusPrompts =
    entry?.status === "weak" ? entry.lastWrongPrompts : undefined;

  const sources = await gatherSourceText(course, loc.topic);
  const questions = await generateQuiz(
    {
      topic: loc.topic,
      chapterTitle: loc.chapterTitle,
      courseTitle: course.title,
      sources,
      count: count ?? 5,
      focusPrompts,
    },
    { provider: user.settings.provider, model: user.settings.model }
  );

  if (questions.length === 0) {
    return fail("Could not generate a quiz for this topic. Please try again.", 502);
  }

  const attemptId = nanoid();
  const pending: PendingQuiz = {
    attemptId,
    userId: user.id,
    courseId,
    topicId,
    kind: "topic",
    createdAt: new Date().toISOString(),
    questions,
  };
  await savePendingQuiz(attemptId, pending);

  const nextTopicId =
    loc.index < loc.order.length - 1 ? loc.order[loc.index + 1] : null;

  // Never send correct answers to the client.
  return ok({
    attemptId,
    topicTitle: loc.topic.title,
    nextTopicId,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
    })),
  });
});
