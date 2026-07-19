import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  getCourse,
  getProgress,
  getPlanCoach,
  savePlanCoach,
} from "@/lib/store/repositories";
import { computeCourseStats } from "@/lib/progress-stats";
import { examTopicIds } from "@/lib/exams";
import { buildExamPlan } from "@/lib/planner";
import { getOrGenerateCached } from "@/lib/ai/cache-key";
import {
  generatePlanCoach,
  PLAN_COACH_PROMPT_VERSION,
  type PlanCoach,
} from "@/lib/plan-coach";

const schema = z.object({
  courseId: z.string(),
  examId: z.string(),
  intensity: z.enum(["relaxed", "steady", "intense"]).optional(),
  regenerate: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 90;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, examId, intensity, regenerate } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const exam = (course.exams ?? []).find((e) => e.id === examId);
  if (!exam) return fail("Exam not found.", 404);

  const stats = computeCourseStats(course, await getProgress(courseId));
  const plan = buildExamPlan(course, stats, exam, { intensity });

  // Weak topics scoped to THIS exam's coverage — stats.weakTopics is
  // course-wide, so an unscoped count would cite weak spots the exam doesn't
  // even cover.
  const scopeIds = new Set(examTopicIds(course, exam));
  const weakCount = stats.weakTopics.filter((t) => scopeIds.has(t.id)).length;

  // Coarse buckets so the note refreshes on a MATERIAL change (crossed a
  // readiness band, entered the final week, pace shifted) — not on every open.
  const readinessBucket = Math.round(plan.readinessPct / 10);
  const daysBucket =
    plan.daysLeft <= 3 ? "final" : plan.daysLeft <= 7 ? "week" : plan.daysLeft <= 21 ? "weeks" : "far";

  const note = await getOrGenerateCached<PlanCoach>({
    fingerprintInput: {
      feature: "plan-coach",
      promptVersion: PLAN_COACH_PROMPT_VERSION,
      provider: user.settings.provider,
      model: user.settings.model ?? "default",
      courseId,
      examId,
      readinessBucket,
      daysBucket,
      pace: plan.pace,
      // Intensity changes perDay (which the note quotes) without changing pace,
      // so it must key the cache — else toggling it shows a stale note that
      // contradicts the command center.
      intensity: intensity ?? "steady",
    },
    read: () => (regenerate ? null : getPlanCoach<unknown>(courseId, examId)),
    save: (cache) => savePlanCoach(courseId, examId, cache),
    generate: () =>
      generatePlanCoach(
        {
          courseTitle: course.title,
          examName: exam.name,
          daysLeft: plan.daysLeft,
          topicsLeft: plan.topicsLeft,
          totalInScope: plan.totalInScope,
          readinessPct: plan.readinessPct,
          perDay: plan.perDay,
          pace: plan.pace,
          weakCount,
        },
        { provider: user.settings.provider, model: user.settings.model }
      ),
    acceptLegacy: false,
  });

  return ok({ note: note.note });
});
