import Link from "next/link";
import {
  RotateCcw,
  GraduationCap,
  ClipboardList,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listActiveCourses } from "@/lib/store/repositories";
import { computeCourseStats, type TopicRef } from "@/lib/progress-stats";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";

type Row = { courseId: string; courseTitle: string; topic: TopicRef };

export default async function RevisionPage() {
  const user = await getCurrentUser();
  const courses = user ? await listActiveCourses(user.id) : [];
  const ready = courses.filter((c) => c.ready && !c.error);

  const all = await Promise.all(
    ready.map(async (c) => ({ course: c, stats: computeCourseStats(c, await getProgress(c.id)) }))
  );

  const weak: Row[] = all.flatMap(({ course, stats }) =>
    stats.weakTopics.map((topic) => ({ courseId: course.id, courseTitle: course.title, topic }))
  );
  const due: Row[] = all.flatMap(({ course, stats }) =>
    stats.reviewDue.map((topic) => ({ courseId: course.id, courseTitle: course.title, topic }))
  );

  const nothing = weak.length === 0 && due.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Revision"
        description="Turn weak topics around, and keep what you've learned fresh with spaced review."
      />

      {nothing ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to revise right now"
          description="No weak topics and nothing due for review. Take some quizzes — low scores show up here, and mastered topics come back on a spaced schedule so you don't forget them."
          action={
            <Button asChild>
              <Link href="/progress">View progress</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {due.length > 0 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <CalendarClock className="h-4 w-4 text-primary" />
                Due for review
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {due.length}
                </span>
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                You&apos;ve learned these — a quick review now locks them in before you forget.
              </p>
              <div className="space-y-2">
                {due.map(({ courseId, courseTitle, topic }) => (
                  <RevisionRow
                    key={`due-${topic.id}`}
                    courseId={courseId}
                    courseTitle={courseTitle}
                    topic={topic}
                    primaryLabel="Review"
                  />
                ))}
              </div>
            </section>
          )}

          {weak.length > 0 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <RotateCcw className="h-4 w-4 text-warning" />
                Weak topics
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {weak.length}
                </span>
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Scored low here. Re-learn, then the re-quiz targets exactly what you missed.
              </p>
              <div className="space-y-2">
                {weak.map(({ courseId, courseTitle, topic }) => (
                  <RevisionRow
                    key={`weak-${topic.id}`}
                    courseId={courseId}
                    courseTitle={courseTitle}
                    topic={topic}
                    primaryLabel="Re-quiz"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionRow({
  courseId,
  courseTitle,
  topic,
  primaryLabel,
}: {
  courseId: string;
  courseTitle: string;
  topic: TopicRef;
  primaryLabel: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{topic.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {courseTitle} · {topic.chapterTitle}
              {topic.lastScore !== null ? ` · last score ${topic.lastScore}%` : ""}
            </span>
            {topic.scores.length > 1 && <Sparkline values={topic.scores} />}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button asChild size="sm" variant="outline">
            <Link href={`/learn/${courseId}/${topic.id}`}>
              <GraduationCap className="h-3.5 w-3.5" />
              Re-learn
            </Link>
          </Button>
          {topic.wrongCount > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/quiz/${courseId}/${topic.id}?redo=1`}>
                <RotateCcw className="h-3.5 w-3.5" />
                Redo {topic.wrongCount}
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/quiz/${courseId}/${topic.id}`}>
              <ClipboardList className="h-3.5 w-3.5" />
              {primaryLabel}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
