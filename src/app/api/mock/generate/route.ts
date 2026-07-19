import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, savePendingQuiz } from "@/lib/store/repositories";
import { generateMockExam } from "@/lib/quiz/mock";
import { scopeCourseToExam } from "@/lib/exams";
import type { PendingQuiz } from "@/lib/quiz/scoring";

const schema = z.object({
  courseId: z.string(),
  count: z.number().int().min(5).max(20).optional(),
  /** Scope the mock to one of the course's exams (omit = whole course). */
  examId: z.string().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 240;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, count, examId } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  if (!course.ready || course.error) return fail("Course is not ready yet.", 409);

  // Exam scope: only that exam's chapters (+ its optional earlier-topic share).
  let examCourse = course;
  if (examId) {
    const exam = (course.exams ?? []).find((e) => e.id === examId);
    if (!exam) return fail("Exam not found for this course.", 404);
    examCourse = scopeCourseToExam(course, exam);
    const scopedTopics = examCourse.subjects.reduce(
      (n, s) => n + s.chapters.reduce((m, ch) => m + ch.topics.length, 0),
      0
    );
    // Guard BEFORE spending an AI call: stale exam coverage (chapter ids that
    // no longer exist after an outline change) would send empty material.
    if (scopedTopics === 0) {
      return fail(
        "This exam's coverage doesn't match the current course outline. Edit the exam and re-select its modules.",
        409
      );
    }
  }

  const questions = await generateMockExam(examCourse, count ?? 10, {
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
