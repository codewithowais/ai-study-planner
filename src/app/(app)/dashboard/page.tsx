import Link from "next/link";
import {
  Upload,
  BookOpen,
  GraduationCap,
  Target,
  RotateCcw,
  ArrowRight,
  CalendarDays,
  CalendarClock,
  Flame,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Baby,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listCoursesWithTerms } from "@/lib/store/repositories";
import { computeCourseStats } from "@/lib/progress-stats";
import { buildStudyPlan, PLAN_KIND_LABEL, type PlanKind } from "@/lib/study-plan";
import { computeStreak } from "@/lib/streak";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CourseCover } from "@/components/course-cover";
import { ProgressRing } from "@/components/progress-ring";
import { CoursePlanButton } from "@/components/course-plan-button";

const KIND_ICON: Record<PlanKind, typeof RotateCcw> = {
  review: RotateCcw,
  weak: RefreshCw,
  continue: GraduationCap,
  new: Baby,
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const withTerms = user ? await listCoursesWithTerms(user.id) : [];
  const courses = withTerms.filter((x) => x.active);
  const firstName = user?.name.split(" ")[0] ?? "there";

  const items = await Promise.all(
    courses.map(async ({ course: c, term }) => ({
      course: c,
      term: term ? `${term.name} ${term.year}` : null,
      stats: c.ready && !c.error ? computeCourseStats(c, await getProgress(c.id)) : null,
    }))
  );

  const totalWeak = items.reduce((n, i) => n + (i.stats?.weakTopics.length ?? 0), 0);
  const ready = items.filter((i) => i.stats);

  const plan = buildStudyPlan(
    ready.map((i) => ({
      courseId: i.course.id,
      courseTitle: i.course.title,
      stats: i.stats!,
      targetDate: i.course.planTargetDate,
    })),
    { examDate: user?.onboarding.examDate }
  );
  const streak = computeStreak(user?.activity?.days ?? []);
  const goalReached = plan.goalToday > 0 && plan.doneToday >= plan.goalToday;

  return (
    <div className="stagger mx-auto max-w-5xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={user?.onboarding.goal ? `Goal: ${user.onboarding.goal}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                streak.current > 0
                  ? "inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-600 ring-1 ring-orange-500/20 dark:text-orange-400"
                  : "inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground"
              }
              title={streak.longest > streak.current ? `Longest streak: ${streak.longest} days` : undefined}
            >
              <Flame className="h-4 w-4" />
              {streak.current > 0
                ? `${streak.current}-day streak`
                : "Start a streak today"}
            </span>
            <Button asChild data-tour="upload">
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload material
              </Link>
            </Button>
          </div>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Upload a PDF, notes or past papers and we'll build a structured course you can learn topic by topic."
          action={
            <Button asChild>
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload your first resource
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Today's session — a paced, do-this-now checklist */}
          <div
            data-tour="focus"
            className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-accent/50"
          >
            <div className="flex flex-col gap-3 border-b border-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Today&apos;s session
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.paced
                    ? plan.soonestDays === 0
                      ? "A target is due today — here's a final push."
                      : `Aim for ${plan.perDay} topic${plan.perDay === 1 ? "" : "s"}/day to finish on time${plan.soonestDays !== null ? ` · next target in ${plan.soonestDays} day${plan.soonestDays === 1 ? "" : "s"}` : ""}.`
                    : `Your daily goal: ${plan.perDay} topic${plan.perDay === 1 ? "" : "s"}. ${plan.remaining} left to master.`}
                </p>
                {!plan.paced && (
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Want a deadline? Open a course → “Set a study plan” to pick how many days.
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold tabular-nums">
                  {Math.min(plan.doneToday, plan.goalToday)}
                  <span className="text-base font-medium text-muted-foreground">/{plan.goalToday}</span>
                </p>
                <p className="text-xs text-muted-foreground">done today</p>
              </div>
            </div>

            <div className="p-3">
              {goalReached || plan.session.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <CheckCircle2 className="h-9 w-9 text-success" />
                  <p className="font-semibold">
                    {plan.session.length === 0 ? "Everything's covered — nice work! 🎉" : "Today's goal reached! 🎉"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plan.session.length === 0
                      ? "Try a mock exam to pressure-test what you know."
                      : "Ahead of schedule? Keep going below or take a mock exam."}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-1">
                    <Link href="/mock">
                      <Target className="h-4 w-4" />
                      Take a mock exam
                    </Link>
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {plan.session.map((it, i) => {
                    const Icon = KIND_ICON[it.kind];
                    const isReview = it.kind === "review" || it.kind === "weak";
                    return (
                      <li key={it.topicId}>
                        <Link
                          href={
                            isReview
                              ? `/quiz/${it.courseId}/${it.topicId}`
                              : `/learn/${it.courseId}/${it.topicId}`
                          }
                          className="group flex items-center gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-transparent transition hover:bg-background hover:ring-border"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {i + 1}. {it.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {PLAN_KIND_LABEL[it.kind]} · {it.courseTitle}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {totalWeak > 0 && (
            <Link href="/revision" className="mb-6 block">
              <div className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <RotateCcw className="h-4 w-4 text-warning" />
                  {totalWeak} topic{totalWeak === 1 ? " needs" : "s need"} extra review
                </p>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  Revise now <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          )}

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your courses
          </h2>
          <div data-tour="courses" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ course, term, stats }) => (
              <Card
                key={course.id}
                className="group flex flex-col overflow-hidden border-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                <CourseCover
                  id={course.id}
                  title={course.title}
                  topRight={
                    <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                      {!course.ready ? "Building…" : course.error ? "Error" : "Ready"}
                    </span>
                  }
                />
                <div className="flex flex-1 flex-col p-5">
                  {term && (
                    <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {term}
                    </span>
                  )}
                  <h3 className="line-clamp-2 font-semibold leading-snug">{course.title}</h3>

                  {stats ? (
                    <>
                      <div className="mt-4 flex items-center gap-3">
                        <ProgressRing value={stats.progressPct} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-sm font-medium">
                            <Target className="h-3.5 w-3.5 text-primary" />
                            {stats.readinessLabel}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {stats.completedOrMastered}/{stats.total} topics done
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <CoursePlanButton
                          courseId={course.id}
                          courseTitle={course.title}
                          initialTargetDate={course.planTargetDate}
                          remaining={Math.max(0, stats.total - stats.completedOrMastered)}
                        />
                      </div>
                      <div className="mt-auto flex gap-2 pt-4">
                        <Button asChild size="sm" className="flex-1">
                          <Link href={`/learn/${course.id}/${stats.resumeId}`}>
                            <GraduationCap className="h-3.5 w-3.5" />
                            {stats.lastTopicId ? "Resume" : "Start"}
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/courses/${course.id}`}>Outline</Link>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 flex flex-1 flex-col">
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                        {course.error ? course.error : "Generating your course outline…"}
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-auto self-start">
                        <Link href={`/courses/${course.id}`}>Open</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
