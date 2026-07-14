import Link from "next/link";
import { GraduationCap, Upload, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listActiveCourses } from "@/lib/store/repositories";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function LearnIndexPage() {
  const user = await getCurrentUser();
  const courses = user ? await listActiveCourses(user.id) : [];
  const ready = courses.filter((c) => c.ready && !c.error);

  const withResume = await Promise.all(
    ready.map(async (c) => {
      const progress = await getProgress(c.id);
      const firstTopic = c.subjects[0]?.chapters[0]?.topics[0]?.id;
      const resumeId = progress?.lastTopicId ?? firstTopic;
      const started = !!progress?.lastTopicId;
      return { course: c, resumeId, started };
    })
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Learn"
        description="Pick a course and continue learning step-by-step."
      />

      {withResume.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nothing to learn yet"
          description="Upload material and generate a course to start learning."
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
        <div className="space-y-3">
          {withResume.map(({ course, resumeId, started }) => (
            <Card key={course.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{course.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {started ? "Continue where you left off" : "Start from the first topic"}
                  </p>
                </div>
                {resumeId && (
                  <Button asChild className="shrink-0">
                    <Link href={`/learn/${course.id}/${resumeId}`}>
                      {started ? "Resume" : "Start"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
