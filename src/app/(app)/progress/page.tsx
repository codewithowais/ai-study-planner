import Link from "next/link";
import {
  Target,
  Upload,
  GraduationCap,
  RotateCcw,
  ClipboardList,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listActiveCourses } from "@/lib/store/repositories";
import { computeCourseStats, scopedReadiness, type CourseStats } from "@/lib/progress-stats";
import { examTopicIds } from "@/lib/exams";
import { daysLeftUntil, prettyDate } from "@/lib/plan-dates";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import type { Course, QuizAttempt } from "@/lib/types";

export default async function ProgressPage() {
  const user = await getCurrentUser();
  const courses = user ? await listActiveCourses(user.id) : [];
  const ready = courses.filter((c) => c.ready && !c.error);

  const items = await Promise.all(
    ready.map(async (c) => {
      const progress = await getProgress(c.id);
      return {
        course: c,
        stats: computeCourseStats(c, progress),
        mockAttempts: progress?.mockAttempts ?? [],
      };
    })
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Progress & exam readiness"
        description="Track what you've mastered, what needs work, and how ready you are."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No progress yet"
          description="Upload material and start learning to see your progress here."
          action={
            <Button asChild>
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload material
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {items.map(({ course, stats, mockAttempts }) => (
            <CourseProgress
              key={course.id}
              course={course}
              stats={stats}
              mockAttempts={mockAttempts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const READINESS_COLOR: Record<CourseStats["readinessLabel"], string> = {
  "Not ready": "text-destructive",
  "Getting there": "text-warning",
  "Almost ready": "text-primary",
  "Exam ready": "text-success",
};

function CourseProgress({
  course,
  stats,
  mockAttempts,
}: {
  course: Course;
  stats: CourseStats;
  mockAttempts: QuizAttempt[];
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href={`/courses/${course.id}`} className="font-semibold hover:underline">
              {course.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {stats.completedOrMastered} of {stats.total} topics done
            </p>
          </div>
          {stats.resumeId && (
            <Button asChild size="sm">
              <Link href={`/learn/${course.id}/${stats.resumeId}`}>
                <GraduationCap className="h-4 w-4" />
                {stats.lastTopicId ? "Resume" : "Start"}
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Syllabus progress</span>
              <span className="font-medium">{stats.progressPct}%</span>
            </div>
            <Progress value={stats.progressPct} className="h-2" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Exam readiness</span>
              <span className={`font-medium ${READINESS_COLOR[stats.readinessLabel]}`}>
                {stats.readinessLabel}
              </span>
            </div>
            <Progress value={stats.readinessPct} className="h-2" />
          </div>
        </div>

        {/* Per-exam readiness — "am I ready for the exam I actually have?" */}
        {(course.exams ?? []).length > 0 && (
          <div className="mt-5 space-y-3 rounded-lg border border-primary/20 bg-accent/30 p-4">
            {[...(course.exams ?? [])]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((exam) => {
                const ids = new Set(examTopicIds(course, exam));
                const r = scopedReadiness(stats.allTopics, ids);
                const left = daysLeftUntil(exam.date);
                return (
                  <div key={exam.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {exam.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {left < 0
                            ? `passed (${prettyDate(exam.date)})`
                            : left === 0
                              ? "today!"
                              : `in ${left} day${left === 1 ? "" : "s"}`}
                          {" · "}
                          {r.done}/{r.total} topics done
                        </span>
                      </span>
                      <span className="font-medium">{r.readinessPct}% ready</span>
                    </div>
                    <Progress value={r.readinessPct} className="h-2" />
                  </div>
                );
              })}
          </div>
        )}

        {/* Status breakdown */}
        <div className="mt-5 flex flex-wrap gap-2">
          <StatPill label="Mastered" value={stats.counts.mastered} variant="success" />
          <StatPill label="Completed" value={stats.counts.completed} variant="success" />
          <StatPill label="Needs work" value={stats.counts.weak} variant="warning" />
          <StatPill label="Learning" value={stats.counts.learning} variant="default" />
          <StatPill label="Not started" value={stats.counts.not_started} variant="secondary" />
        </div>

        {/* Weak topics */}
        {stats.weakTopics.length > 0 ? (
          <div className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <RotateCcw className="h-4 w-4 text-warning" />
              {stats.weakTopics.length} topic{stats.weakTopics.length === 1 ? " needs" : "s need"} review
            </p>
            <ul className="space-y-2">
              {stats.weakTopics.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-background p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">
                        {t.chapterTitle}
                        {t.lastScore !== null ? ` · last score ${t.lastScore}%` : ""}
                      </span>
                      {t.scores.length > 1 && <Sparkline values={t.scores} />}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/learn/${course.id}/${t.id}`}>
                        <GraduationCap className="h-3.5 w-3.5" />
                        Re-learn
                      </Link>
                    </Button>
                    {t.wrongCount > 0 && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/quiz/${course.id}/${t.id}?redo=1`}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Redo {t.wrongCount}
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/quiz/${course.id}/${t.id}`}>
                        <ClipboardList className="h-3.5 w-3.5" />
                        Re-quiz
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {stats.weakTopics.length > 5 && (
              <Link
                href="/revision"
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                View all in Revision →
              </Link>
            )}
          </div>
        ) : stats.completedOrMastered > 0 ? (
          <p className="mt-6 flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            No weak topics right now — keep it up!
          </p>
        ) : null}

        {/* Past mock exams — attempts are stored but were never surfaced */}
        {mockAttempts.length > 0 && (
          <div className="mt-6 rounded-lg border border-border bg-background/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ClipboardList className="h-4 w-4 text-primary" />
                Past mock exams
              </p>
              {mockAttempts.length > 1 && (
                // mockAttempts is stored newest-first; Sparkline wants oldest→newest.
                <Sparkline values={[...mockAttempts].reverse().map((a) => a.score)} />
              )}
            </div>
            <ul className="space-y-1.5">
              {/* mockAttempts is newest-first; show the 6 most recent as-is. */}
              {mockAttempts
                .slice(0, 6)
                .map((a) => {
                  const correct = a.answers.filter((x) => x.correct).length;
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/mock/review/${course.id}/${a.id}`}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition hover:bg-accent"
                        title="Reopen this mock's full review"
                      >
                        <span className="text-muted-foreground">
                          {prettyDate(a.takenAt.slice(0, 10))}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {correct}/{a.questions.length}
                          </span>
                          <span
                            className={`font-semibold ${a.score >= 60 ? "text-success" : "text-warning"}`}
                          >
                            {a.score}%
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatPill({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "warning" | "default" | "secondary";
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-sm">
      <Badge variant={variant} className="px-1.5 py-0 text-xs">
        {value}
      </Badge>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
