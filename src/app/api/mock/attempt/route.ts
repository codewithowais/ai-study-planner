import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getProgress } from "@/lib/store/repositories";

const querySchema = z.object({
  courseId: z.string().min(1),
  attemptId: z.string().min(1),
});

export const runtime = "nodejs";

// Re-serve a stored mock-exam attempt as a graded review. Nothing is
// regenerated — the attempt already holds the questions + the student's
// answers; we just map it to the review shape the UI renders.
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const { courseId, attemptId } = querySchema.parse({
    courseId: url.searchParams.get("courseId"),
    attemptId: url.searchParams.get("attemptId"),
  });

  // Ownership: the course must belong to the user (same gate as mock/generate).
  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Attempt not found.", 404);

  const progress = await getProgress(courseId);
  const attempt = progress?.mockAttempts?.find((a) => a.id === attemptId);
  // Missing = evicted (mockAttempts is capped), wrong id, or a topic-kind
  // attempt (never stored here). Indistinct 404 either way.
  if (!attempt) return fail("This mock exam is no longer available.", 404);

  const results = attempt.questions.map((q) => {
    const answer = attempt.answers.find((a) => a.questionId === q.id);
    return {
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      selectedIndex: answer?.selectedIndex ?? -1,
      correct: answer?.correct ?? false,
      explanation: q.explanation,
      source: q.source ? { page: q.source.page } : null,
    };
  });

  return ok({
    courseId,
    courseTitle: course.title,
    score: attempt.score,
    correctCount: attempt.answers.filter((a) => a.correct).length,
    total: attempt.questions.length,
    takenAt: attempt.takenAt,
    results,
  });
});
