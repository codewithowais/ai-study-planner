import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  deletePendingQuiz,
  getPendingQuiz,
  recordStudyDay,
  updateProgress,
} from "@/lib/store/repositories";
import { statusFromScore, computeNextReview, type PendingQuiz } from "@/lib/quiz/scoring";
import { localDateKey } from "@/lib/streak";
import type { CourseProgress, QuizAttempt } from "@/lib/types";

const schema = z.object({
  attemptId: z.string(),
  answers: z.array(
    z.object({ questionId: z.string(), selectedIndex: z.number().int() })
  ),
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { attemptId, answers } = schema.parse(await req.json());

  const pending = await getPendingQuiz<PendingQuiz>(attemptId);
  if (!pending || pending.userId !== user.id) {
    return fail("This quiz has expired. Please start a new one.", 404);
  }

  const selectedByQ = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));

  const graded = pending.questions.map((q) => {
    const selectedIndex = selectedByQ.get(q.id) ?? -1;
    const correct = selectedIndex === q.correctIndex;
    return {
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      selectedIndex,
      correct,
      explanation: q.explanation,
      source: q.source ?? null,
    };
  });

  const correctCount = graded.filter((g) => g.correct).length;
  const score = Math.round((correctCount / graded.length) * 100);
  const newStatus = statusFromScore(score);

  const attempt: QuizAttempt = {
    id: nanoid(8),
    topicId: pending.topicId,
    kind: pending.kind,
    takenAt: new Date().toISOString(),
    score,
    questions: pending.questions,
    answers: graded.map((g) => ({
      questionId: g.id,
      selectedIndex: g.selectedIndex,
      correct: g.correct,
    })),
  };

  const wrongIds = new Set(graded.filter((g) => !g.correct).map((g) => g.id));
  const wrongQuestions = pending.questions.filter((q) => wrongIds.has(q.id));
  const wrongPrompts = wrongQuestions.map((q) => q.prompt);

  const fallback: CourseProgress = {
    courseId: pending.courseId,
    userId: user.id,
    topics: {},
    updatedAt: new Date().toISOString(),
    mockAttempts: [],
  };

  await updateProgress(pending.courseId, fallback, (p) => {
    if (pending.kind === "mock") {
      // Mock exams are recorded at the course level, not per topic.
      p.mockAttempts = [attempt, ...(p.mockAttempts ?? [])].slice(0, 20);
      p.updatedAt = new Date().toISOString();
      return p;
    }
    const entry = p.topics[pending.topicId] ?? {
      topicId: pending.topicId,
      status: "not_started" as const,
      bookmarked: false,
      notes: "",
      scores: [],
    };
    entry.scores.push(score);
    // Don't downgrade a mastered topic to "completed" on a lower re-attempt,
    // but always surface weakness.
    if (newStatus === "weak") entry.status = "weak";
    else if (entry.status !== "mastered") entry.status = newStatus;
    else if (newStatus === "mastered") entry.status = "mastered";

    // Remember what was missed (for targeted re-quiz + "redo wrong answers").
    entry.lastWrongQuestions = wrongQuestions;
    entry.lastWrongPrompts = wrongPrompts;

    // Schedule the next spaced-repetition review.
    const { interval, nextReviewAt } = computeNextReview(score, entry.reviewInterval);
    entry.reviewInterval = interval;
    entry.nextReviewAt = nextReviewAt;

    p.topics[pending.topicId] = entry;
    p.lastTopicId = pending.topicId;
    p.updatedAt = new Date().toISOString();
    return p;
  });

  await deletePendingQuiz(attemptId);
  await recordStudyDay(user.id, localDateKey());

  const weakAreas = wrongPrompts;

  return ok({
    score,
    correctCount,
    total: graded.length,
    status: newStatus,
    results: graded,
    weakAreas,
  });
});
