import Link from "next/link";
import {
  CalendarClock,
  GraduationCap,
  RotateCcw,
  RefreshCw,
  ClipboardList,
  Target,
  Sparkles,
  Flag,
  ChevronRight,
  Flame,
  CalendarDays,
  Gauge,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listActiveCourses } from "@/lib/store/repositories";
import { computeCourseStats } from "@/lib/progress-stats";
import {
  buildExamPlan,
  PACE_META,
  PLANNER_KIND_LABEL,
  type ExamPlan,
  type Intensity,
  type PlannerActivity,
  type PlannerKind,
} from "@/lib/planner";
import { prettyDate } from "@/lib/plan-dates";
import { computeStreak } from "@/lib/streak";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/progress-ring";
import { PlanCoachNote } from "@/components/plan-coach-note";

const KIND_ICON: Record<PlannerKind, typeof RotateCcw> = {
  review: RotateCcw,
  weak: RefreshCw,
  continue: GraduationCap,
  new: Sparkles,
  mock: Target,
  final: Flag,
};

const TONE_RING: Record<string, string> = {
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  primary: "bg-primary/10 text-primary ring-primary/25",
  destructive: "bg-destructive/10 text-destructive ring-destructive/25",
};

const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: "relaxed", label: "Relaxed" },
  { id: "steady", label: "Steady" },
  { id: "intense", label: "Intense" },
];

function itemHref(courseId: string, examId: string, it: PlannerActivity): string | null {
  if (it.kind === "mock") return `/mock?course=${courseId}&exam=${examId}`;
  if (it.kind === "final" || !it.topicId) return null;
  return it.kind === "review" || it.kind === "weak"
    ? `/quiz/${courseId}/${it.topicId}`
    : `/learn/${courseId}/${it.topicId}`;
}

/** One runway activity row — deep-links to learn/quiz/mock (with course+exam
 * context so a mock opens the right scope); milestone rows are non-clickable.
 * Shared by the day cards and the exam-day cram list. */
function RunwayItem({
  item,
  courseId,
  examId,
}: {
  item: PlannerActivity;
  courseId: string;
  examId: string;
}) {
  const Icon = KIND_ICON[item.kind];
  const href = itemHref(courseId, examId, item);
  const inner = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {PLANNER_KIND_LABEL[item.kind]}
          {item.chapterTitle ? ` · ${item.chapterTitle}` : ""}
        </span>
      </span>
      {href && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg bg-background/60 p-2 ring-1 ring-transparent transition hover:bg-background hover:ring-border"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-lg bg-background/40 p-2">{inner}</div>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: { intensity?: string; exam?: string };
}) {
  const user = await getCurrentUser();
  const courses = user ? await listActiveCourses(user.id) : [];
  const ready = courses.filter((c) => c.ready && !c.error);

  const intensity: Intensity =
    searchParams.intensity === "relaxed" || searchParams.intensity === "intense"
      ? searchParams.intensity
      : "steady";

  // Build a runway for every upcoming exam across courses.
  const plans: ExamPlan[] = [];
  let coursesWithoutExam = 0;
  for (const course of ready) {
    const stats = computeCourseStats(course, await getProgress(course.id));
    const upcoming = (course.exams ?? []).filter(
      (e) => e.chapterIds.length > 0
    );
    if (upcoming.length === 0) {
      coursesWithoutExam++;
      continue;
    }
    let added = 0;
    for (const exam of upcoming) {
      const plan = buildExamPlan(course, stats, exam, { intensity });
      if (plan.daysLeft >= 0) {
        plans.push(plan);
        added++;
      }
    }
    if (added === 0) coursesWithoutExam++;
  }
  plans.sort((a, b) => a.daysLeft - b.daysLeft);

  const streak = computeStreak(user?.activity?.days ?? []);

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Study plan"
          description="A day-by-day runway to each of your exams."
        />
        <EmptyState
          icon={CalendarClock}
          title="No exams scheduled yet"
          description={
            ready.length > 0
              ? "Open a course and add an exam (midterm/final) with its date and chapters — your planner will build a paced, day-by-day runway to it."
              : "Upload material to create a course first, then add an exam to plan toward it."
          }
          action={
            <Button asChild>
              <Link href={ready.length > 0 ? "/courses" : "/upload"}>
                {ready.length > 0 ? "Go to my courses" : "Upload material"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const focus = plans.find((p) => p.examId === searchParams.exam) ?? plans[0];
  const pace = PACE_META[focus.pace];
  const coveragePct =
    focus.totalInScope > 0
      ? Math.round(((focus.totalInScope - focus.topicsLeft) / focus.totalInScope) * 100)
      : 100;

  // Keep the timeline tight: detail the next ~2 weeks, then summarize the gap
  // before the exam day so a distant final doesn't scroll forever.
  // Study days only — the exam day is rendered as its own milestone below, so
  // it must NOT also appear here (that double-rendered it for exams ≤ ~2 weeks).
  const studyDays = focus.days.filter((d) => !d.isExamDay);
  const DETAIL = 15;
  const detailed = studyDays.slice(0, DETAIL);
  const hiddenCount = studyDays.length - detailed.length;
  const examDay = focus.days.find((d) => d.isExamDay) ?? focus.days[focus.days.length - 1];
  // Non-marker items on the exam day (only present when the exam is TODAY and
  // topics remain — a last-minute cram list).
  const examDayCram = examDay.items.filter((it) => it.kind !== "final");
  const showSummaryGap = hiddenCount > 0;

  return (
    <div className="stagger mx-auto max-w-4xl">
      <PageHeader
        title="Study plan"
        description="Your day-by-day runway to each exam — paced to the deadline and what's left."
        actions={
          <span
            className={
              streak.current > 0
                ? "inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-600 ring-1 ring-orange-500/20 dark:text-orange-400"
                : "inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground"
            }
          >
            <Flame className="h-4 w-4" />
            {streak.current > 0 ? `${streak.current}-day streak` : "Start a streak"}
          </span>
        }
      />

      {/* Exam switcher */}
      {plans.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {plans.map((p) => {
            const active = p.examId === focus.examId;
            return (
              <Link
                key={`${p.courseId}-${p.examId}`}
                href={`/plan?exam=${p.examId}&intensity=${intensity}`}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
                }
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {p.examName}
                <span className="opacity-70">· {p.daysLeft === 0 ? "today" : `${p.daysLeft}d`}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Command center */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-accent/40 to-accent/20">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <CalendarClock className="h-3.5 w-3.5" />
              Preparing for
            </p>
            <h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{focus.examName}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {focus.courseTitle} · {prettyDate(focus.examDate)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE_RING[pace.tone]}`}
              >
                <Gauge className="h-3.5 w-3.5" />
                {pace.label}
              </span>
              <span className="text-sm text-muted-foreground">
                {focus.topicsLeft === 0
                  ? "All topics covered — keep them fresh & mock it."
                  : `${focus.topicsLeft} of ${focus.totalInScope} topics left · ~${focus.perDay}/day`}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-5">
            <div className="text-center">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {focus.daysLeft}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {focus.daysLeft === 1 ? "day left" : "days left"}
              </p>
            </div>
            <div className="text-center">
              <ProgressRing value={focus.readinessPct} size={56} />
              <p className="mt-1 text-xs text-muted-foreground">ready</p>
            </div>
          </div>
        </div>
        {/* Coverage bar */}
        <div className="h-1.5 w-full bg-primary/10">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Coach + intensity */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <PlanCoachNote courseId={focus.courseId} examId={focus.examId} intensity={intensity} />
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Intensity
          </p>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {INTENSITIES.map((lvl) => {
              const active = lvl.id === intensity;
              return (
                <Link
                  key={lvl.id}
                  href={`/plan?exam=${focus.examId}&intensity=${lvl.id}`}
                  className={
                    active
                      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                  }
                >
                  {lvl.label}
                </Link>
              );
            })}
          </div>
          <p className="mt-2 max-w-[16rem] text-xs text-muted-foreground">
            How hard to front-load. Relaxed spreads it out; Intense finishes early.
          </p>
        </div>
      </div>

      {/* Runway */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        Your runway to {focus.examName}
      </h2>
      <ol className="relative ml-3 space-y-3 border-l border-border pl-6">
        {detailed.map((day) => (
          <li key={day.key} className="relative">
            <span
              className={`absolute -left-[31px] top-3 h-3 w-3 rounded-full ring-4 ring-background ${
                day.isToday ? "bg-primary" : "bg-border"
              }`}
            />
            <div
              className={`rounded-xl border p-4 ${
                day.isToday ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className={`text-sm font-semibold ${day.isToday ? "text-primary" : ""}`}>
                  {day.label}
                </p>
                {day.isToday && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Do this today
                  </span>
                )}
              </div>
              {day.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Buffer day — rest, or get ahead.</p>
              ) : (
                <ul className="space-y-1.5">
                  {day.items.map((it, i) => (
                    <li key={i}>
                      <RunwayItem item={it} courseId={focus.courseId} examId={focus.examId} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}

        {showSummaryGap && hiddenCount > 0 && (
          <li className="relative">
            <span className="absolute -left-[29px] top-2.5 h-2 w-2 rounded-full bg-border ring-4 ring-background" />
            <p className="px-1 text-sm text-muted-foreground">
              + {hiddenCount} more day{hiddenCount === 1 ? "" : "s"} of steady work until the exam…
            </p>
          </li>
        )}

        {/* Exam day */}
        <li className="relative">
          <span className="absolute -left-[32px] top-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-4 ring-background">
            <Flag className="h-2.5 w-2.5 text-primary-foreground" />
          </span>
          <div className="rounded-xl border border-primary/40 bg-primary/[0.06] p-4">
            <p className="text-sm font-semibold text-primary">{examDay.label} · Exam day</p>
            <p className="text-sm text-muted-foreground">
              {focus.examName} — {prettyDate(focus.examDate)}. Trust your prep. You've got this.
            </p>
            {examDayCram.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-primary">
                  Exam is today — a fast final pass on what&apos;s left:
                </p>
                <ul className="space-y-1.5">
                  {examDayCram.map((it, i) => (
                    <li key={i}>
                      <RunwayItem item={it} courseId={focus.courseId} examId={focus.examId} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </li>
      </ol>

      {coursesWithoutExam > 0 && (
        <p className="mt-6 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {coursesWithoutExam} other course{coursesWithoutExam === 1 ? " has" : "s have"} no exam
          set.{" "}
          <Link href="/courses" className="font-medium text-primary hover:underline">
            Add an exam
          </Link>{" "}
          to include {coursesWithoutExam === 1 ? "it" : "them"} in your plan.
        </p>
      )}
    </div>
  );
}
