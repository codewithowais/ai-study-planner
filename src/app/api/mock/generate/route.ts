import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, savePendingQuiz } from "@/lib/store/repositories";
import { generateMockExam } from "@/lib/quiz/mock";
import type { PendingQuiz } from "@/lib/quiz/scoring";

const schema = z.object({
  courseId: z.string(),
  count: z.number().int().min(5).max(20).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 240;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, count } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  if (!course.ready || course.error) return fail("Course is not ready yet.", 409);

  const questions = await generateMockExam(course, count ?? 10, {
    provider: user.settings.provider,
    model: user.settings.model,
  });

  if (questions.length === 0) {
    return fail("Could not generate the mock exam. Please try again.", 502);
  }

  const attemptId = nanoid();
  const pending: PendingQuiz = {
    attemptId,
    userId: user.id,
    courseId,
    topicId: "",
    kind: "mock",
    createdAt: new Date().toISOString(),
    questions,
  };
  await savePendingQuiz(attemptId, pending);

  return ok({
    attemptId,
    courseTitle: course.title,
    questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, choices: q.choices })),
  });
});
