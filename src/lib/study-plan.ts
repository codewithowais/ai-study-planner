// Turns "these topics, a per-course deadline, and where you are" into a
// concrete, paced daily session so a student always knows what to do today.
import type { CourseStats, TopicRef } from "@/lib/progress-stats";
import { localDateKey } from "@/lib/streak";

export type PlanKind = "review" | "weak" | "continue" | "new";

export interface PlanItem {
  courseId: string;
  courseTitle: string;
  topicId: string;
  title: string;
  chapterTitle: string;
  kind: PlanKind;
}

export interface StudyPlan {
  /** Topics not yet completed or mastered, across all active courses. */
  remaining: number;
  /** Recommended topics to finish today (sum of each course's pace). */
  perDay: number;
  /** Whether at least one course is paced by a target/exam date. */
  paced: boolean;
  /** Soonest number of days to any course target (null if none set). */
  soonestDays: number | null;
  /** Today's recommended topics, in priority order. */
  session: PlanItem[];
  /** Topics already completed/mastered today. */
  doneToday: number;
  /** perDay (the goal) — alias for clarity in the UI. */
  goalToday: number;
  /** The very next exam across all courses (what today is really about). */
  focusExam: { name: string; courseTitle: string; daysLeft: number } | null;
}

export interface PlanExam {
  name: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Topic ids the exam covers. */
  topicIds: string[];
}

export interface PlanCourse {
  courseId: string;
  courseTitle: string;
  stats: CourseStats;
  /** Per-course "finish by" date (ISO). */
  targetDate?: string | null;
  /** Exams (midterm/final): the nearest upcoming one scopes & paces the course. */
  exams?: PlanExam[];
}

const NOT_DONE = new Set(["not_started", "learning", "weak"]);
const DONE = new Set(["completed", "mastered"]);
const PER_COURSE_MAX = 10;
const DAILY_CAP = 12;
const DEFAULT_PER_COURSE = 3;

function daysUntil(dateStr: string, todayKey: string): number {
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function buildStudyPlan(
  courses: PlanCourse[],
  opts: { examDate?: string; todayKey?: string } = {}
): StudyPlan {
  const todayKey = opts.todayKey ?? localDateKey();

  let remaining = 0;
  let doneToday = 0;
  let soonestDays: number | null = null;
  let paced = false;
  let focusExam: StudyPlan["focusExam"] = null;

  // Per-course: how many topics to do today + a prioritised candidate list.
  const perCourse = courses.map((c) => {
    for (const t of c.stats.allTopics) {
      if (DONE.has(t.status) && t.lastVisited && localDateKey(new Date(t.lastVisited)) === todayKey) {
        doneToday++;
      }
    }

    // Exam-first: the nearest upcoming exam scopes the course to its coverage
    // and paces to its date. Without exams, fall back to the plan/global date.
    // Exams whose coverage no longer resolves to any topics (stale chapter ids
    // after an outline change) are skipped — an empty coverage set would
    // otherwise block every topic and tell the student there's nothing to do.
    const upcoming = (c.exams ?? [])
      .map((e) => ({ ...e, days: daysUntil(e.date, todayKey) }))
      .filter((e) => e.days >= 0 && e.topicIds.length > 0)
      .sort((a, b) => a.days - b.days)[0];

    const coverage = upcoming ? new Set(upcoming.topicIds) : null;
    const inScope = (t: TopicRef) => !coverage || coverage.has(t.id);

    const notDone = c.stats.allTopics.filter(
      (t) => NOT_DONE.has(t.status) && inScope(t)
    );
    remaining += c.stats.allTopics.filter((t) => NOT_DONE.has(t.status)).length;

    const date = upcoming ? upcoming.date : (c.targetDate ?? opts.examDate ?? null);
    let req = Math.min(notDone.length, DEFAULT_PER_COURSE);
    if (date) {
      const d = daysUntil(date, todayKey);
      if (d >= 0) {
        paced = true;
        if (upcoming || c.targetDate) {
          soonestDays = soonestDays === null ? d : Math.min(soonestDays, d);
        }
        if (upcoming && (focusExam === null || d < focusExam.daysLeft)) {
          focusExam = { name: upcoming.name, courseTitle: c.courseTitle, daysLeft: d };
        }
        req =
          notDone.length === 0
            ? 0
            : d > 0
              ? Math.min(PER_COURSE_MAX, Math.max(1, Math.ceil(notDone.length / d)))
              : Math.min(notDone.length, PER_COURSE_MAX); // due today — cram
      }
    }

    // Candidate topics in priority order: due reviews → weak → continue → new
    // (all restricted to the upcoming exam's coverage when one exists).
    const seen = new Set<string>();
    const candidates: TopicRef[] = [];
    const add = (t?: TopicRef) => {
      if (t && !seen.has(t.id) && inScope(t)) {
        seen.add(t.id);
        candidates.push(t);
      }
    };
    c.stats.reviewDue.forEach(add);
    c.stats.weakTopics.forEach(add);
    const cont = c.stats.lastTopicId
      ? c.stats.allTopics.find((x) => x.id === c.stats.lastTopicId)
      : undefined;
    if (cont && NOT_DONE.has(cont.status)) add(cont);
    c.stats.allTopics.filter((t) => t.status === "not_started").forEach(add);

    return { c, req: Math.min(req, notDone.length), candidates };
  });

  // Round-robin across courses so a multi-course day stays balanced.
  const session: PlanItem[] = [];
  const goalToday = Math.min(DAILY_CAP, perCourse.reduce((n, p) => n + p.req, 0));
  const cursors = perCourse.map(() => 0);
  let progressed = true;
  while (session.length < goalToday && progressed) {
    progressed = false;
    for (let ci = 0; ci < perCourse.length && session.length < goalToday; ci++) {
      const p = perCourse[ci];
      const kindFor = (t: TopicRef): PlanKind => {
        if (t.status === "weak") return "weak";
        if (p.c.stats.reviewDue.some((r) => r.id === t.id)) return "review";
        if (t.id === p.c.stats.lastTopicId) return "continue";
        return "new";
      };
      // How many this course has contributed so far.
      const taken = session.filter((s) => s.courseId === p.c.courseId).length;
      if (taken >= p.req) continue;
      const t = p.candidates[cursors[ci]++];
      if (!t) continue;
      progressed = true;
      session.push({
        courseId: p.c.courseId,
        courseTitle: p.c.courseTitle,
        topicId: t.id,
        title: t.title,
        chapterTitle: t.chapterTitle,
        kind: kindFor(t),
      });
    }
  }

  return {
    remaining,
    perDay: goalToday,
    paced,
    soonestDays,
    session,
    doneToday,
    goalToday,
    focusExam,
  };
}

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  review: "Review",
  weak: "Fix weak spot",
  continue: "Continue",
  new: "New topic",
};
