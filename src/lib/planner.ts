// Turns an exam (name + date + covered chapters) and where the student is into
// a concrete day-by-day runway: what to study each day to be ready in time,
// with a mock auto-scheduled near the end and an exam-day marker. This is the
// forward-looking engine behind the /plan page (dashboard's buildStudyPlan
// only knows "today"; this projects the whole stretch to the exam).
import type { Course, CourseExam } from "@/lib/types";
// Value imports are relative (with .ts) so this module is unit-testable under
// `node --experimental-strip-types`, which can't resolve the "@/" alias for
// runtime imports (type-only "@/" imports are erased, so they're fine).
import { scopedReadiness, type CourseStats, type TopicRef } from "./progress-stats.ts";
import { localDateKey } from "./streak.ts";

/** Topic ids an exam covers (its chapters' topics). Inlined from lib/exams to
 * keep this module's runtime import chain alias-free for tests. */
function examScopeIds(course: Course, exam: CourseExam): Set<string> {
  const covered = new Set(exam.chapterIds);
  const ids = new Set<string>();
  for (const s of course.subjects)
    for (const c of s.chapters)
      if (covered.has(c.id)) for (const t of c.topics) ids.add(t.id);
  return ids;
}

export type PlannerKind = "review" | "weak" | "continue" | "new" | "mock" | "final";

export interface PlannerActivity {
  kind: PlannerKind;
  /** Present for topic-based activities (learn/review/weak/continue). */
  topicId?: string;
  title: string;
  chapterTitle?: string;
  /** True once the underlying topic is completed/mastered. */
  done?: boolean;
}

export interface PlannerDay {
  /** YYYY-MM-DD. */
  key: string;
  /** "Today", "Tomorrow", or e.g. "Mon, Jul 21". */
  label: string;
  /** Days from today (0 = today). */
  offset: number;
  isToday: boolean;
  isExamDay: boolean;
  items: PlannerActivity[];
}

export type PlannerPace = "comfortable" | "tight" | "behind" | "done";

export interface ExamPlan {
  courseId: string;
  courseTitle: string;
  examId: string;
  examName: string;
  examDate: string;
  daysLeft: number;
  /** Not-yet-done topics inside the exam's coverage. */
  topicsLeft: number;
  totalInScope: number;
  /** Topics/day this plan schedules. */
  perDay: number;
  /** Topics/day actually required to finish coverage in time. */
  requiredPerDay: number;
  readinessPct: number;
  pace: PlannerPace;
  days: PlannerDay[];
}

/** Study intensity — scales how hard the runway front-loads work. */
export type Intensity = "relaxed" | "steady" | "intense";
const INTENSITY_CAP: Record<Intensity, number> = { relaxed: 4, steady: 6, intense: 10 };
const COMFORTABLE = 4;

const NOT_DONE = new Set(["not_started", "learning", "weak"]);

function daysUntil(dateStr: string, todayKey: string): number {
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateAtOffset(todayKey: string, offset: number): Date {
  const [y, m, d] = todayKey.split("-").map(Number);
  return new Date(y, m - 1, d + offset);
}
function keyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function labelFor(offset: number, date: Date): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Build the day-by-day plan for one exam. `intensity` scales the per-day cap
 * (relaxed spreads it out; intense front-loads and finishes early).
 */
export function buildExamPlan(
  course: Course,
  stats: CourseStats,
  exam: CourseExam,
  opts: { intensity?: Intensity; todayKey?: string } = {}
): ExamPlan {
  const todayKey = opts.todayKey ?? localDateKey();
  const intensity = opts.intensity ?? "steady";
  const scopeIds = examScopeIds(course, exam);
  const inScope = (t: TopicRef) => scopeIds.has(t.id);

  // The syllabus march: not-done in-scope topics, weak first, then whatever
  // the student was last on, then remaining learning, then brand-new topics.
  const pool = stats.allTopics.filter((t) => inScope(t) && NOT_DONE.has(t.status));
  const rank = (t: TopicRef) =>
    t.status === "weak" ? 0 : t.id === stats.lastTopicId ? 1 : t.status === "learning" ? 2 : 3;
  pool.sort((a, b) => rank(a) - rank(b));

  // Completed/mastered topics whose spaced review is due — quick refreshers.
  const reviews = stats.reviewDue.filter(inScope);

  const daysLeft = daysUntil(exam.date, todayKey);
  const totalInScope = stats.allTopics.filter(inScope).length;
  const topicsLeft = pool.length;
  const readinessPct = scopedReadiness(stats.allTopics, scopeIds).readinessPct;

  const studyDays = Math.max(1, daysLeft); // whole days before the exam
  const requiredPerDay = topicsLeft === 0 ? 0 : Math.ceil(topicsLeft / studyDays);
  const perDay = Math.max(1, Math.min(INTENSITY_CAP[intensity], requiredPerDay || 1));

  const pace: PlannerPace =
    topicsLeft === 0
      ? "done"
      : requiredPerDay <= COMFORTABLE
        ? "comfortable"
        : requiredPerDay <= INTENSITY_CAP.intense
          ? "tight"
          : "behind";

  // Lay out the days. Fill `perDay` topics per day from the pool; drop a mock
  // ~2 days before the exam and a final-review nudge once topics run out.
  const days: PlannerDay[] = [];
  const mockOffset = daysLeft >= 3 ? daysLeft - 2 : -1;
  let cursor = 0;

  for (let offset = 0; offset <= Math.max(0, daysLeft); offset++) {
    const date = dateAtOffset(todayKey, offset);
    const isExamDay = offset === daysLeft && daysLeft >= 0;
    const items: PlannerActivity[] = [];

    // The exam day is normally just a milestone — but if the exam is TODAY
    // (daysLeft === 0) it's also the last chance to study, so it still carries
    // the review + full cram list under the marker (nothing gets dropped).
    const studyThisDay = !isExamDay || daysLeft === 0;
    if (studyThisDay) {
      if (offset === 0) {
        for (const r of reviews.slice(0, 3)) {
          items.push({
            kind: "review",
            topicId: r.id,
            title: r.title,
            chapterTitle: r.chapterTitle,
            done: false,
          });
        }
      }
      // On the last study day (or the exam-is-today day), cram whatever's left.
      const isLastStudyDay = offset === daysLeft - 1 || (daysLeft === 0 && offset === 0);
      const take = isLastStudyDay ? pool.length - cursor : perDay;
      for (let k = 0; k < take && cursor < pool.length; k++, cursor++) {
        const t = pool[cursor];
        items.push({
          kind: t.status === "weak" ? "weak" : t.id === stats.lastTopicId ? "continue" : "new",
          topicId: t.id,
          title: t.title,
          chapterTitle: t.chapterTitle,
          done: false,
        });
      }
      if (offset === mockOffset) {
        items.push({ kind: "mock", title: `Take a mock exam (${exam.name} scope)` });
      }
      if (!isExamDay && cursor >= pool.length && offset === Math.max(0, daysLeft - 1) && topicsLeft > 0) {
        items.push({ kind: "final", title: "Final review — skim weak spots & key definitions" });
      }
    }
    if (isExamDay) {
      items.push({ kind: "final", title: `${exam.name} — exam day. You've got this.` });
    }

    days.push({
      key: keyOf(date),
      label: labelFor(offset, date),
      offset,
      isToday: offset === 0,
      isExamDay,
      items,
    });
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    examId: exam.id,
    examName: exam.name,
    examDate: exam.date,
    daysLeft,
    topicsLeft,
    totalInScope,
    perDay,
    requiredPerDay,
    readinessPct,
    pace,
    days,
  };
}

export const PACE_META: Record<PlannerPace, { label: string; tone: "success" | "warning" | "primary" | "destructive" }> = {
  done: { label: "Coverage complete", tone: "success" },
  comfortable: { label: "On track", tone: "success" },
  tight: { label: "Tight — stay on it", tone: "warning" },
  behind: { label: "Behind — pick up the pace", tone: "destructive" },
};

export const PLANNER_KIND_LABEL: Record<PlannerKind, string> = {
  review: "Review",
  weak: "Fix weak spot",
  continue: "Continue",
  new: "New topic",
  mock: "Mock exam",
  final: "Milestone",
};
