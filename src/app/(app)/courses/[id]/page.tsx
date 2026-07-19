"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  GraduationCap,
  FileText,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Trash2,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CoursePlan } from "@/components/course-plan";
import { CourseExams } from "@/components/course-exams";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { api, ApiError } from "@/lib/client";
import { STATUS_META } from "@/lib/status";
import { useToast } from "@/components/ui/use-toast";
import type { Course, CourseProgress, TopicStatus } from "@/lib/types";

interface Payload {
  course: Course;
  progress: CourseProgress | null;
}

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Payload>(`/api/courses/${id}`);
      setData(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load course.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the outline is still generating.
  useEffect(() => {
    if (!data || data.course.ready) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);

  async function remove() {
    if (!confirm("Delete this course and its progress? This cannot be undone."))
      return;
    try {
      await api.del(`/api/courses/${id}`);
      toast({ title: "Course deleted" });
      router.push("/dashboard");
    } catch {
      toast({ title: "Could not delete course", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{loadError}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => load()}>
                Try again
              </Button>
              <Button asChild>
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const course = data!.course;

  // Still generating.
  if (!course.ready) {
    return <ProcessingView title={course.title} />;
  }

  if (course.error) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Couldn&apos;t build the course outline</p>
              <p className="mt-1 text-sm text-muted-foreground">{course.error}</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/upload">Upload again</Link>
              </Button>
              <Button variant="destructive" onClick={remove}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OutlineView data={data!} onDelete={remove} onReload={load} />;
}

function ProcessingView({ title }: { title: string }) {
  const steps = [
    "Reading your material",
    "Identifying subjects & chapters",
    "Organizing topics and subtopics",
    "Checking nothing is skipped",
  ];
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
      <h2 className="text-xl font-semibold">Building your course</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Analyzing “{title}”. This can take up to a minute for large documents.
      </p>
      <ul className="mt-6 space-y-2 text-left text-sm">
        {steps.map((s) => (
          <li key={s} className="flex items-center gap-2 text-muted-foreground">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlineView({
  data,
  onDelete,
  onReload,
}: {
  data: Payload;
  onDelete: () => void;
  onReload: () => void;
}) {
  const { course, progress } = data;
  const { toast } = useToast();
  const addInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  function addResource(file: File | null) {
    if (!file) return;
    setAdding(true);
    const form = new FormData();
    form.append("file", file);
    fetch(`/api/courses/${course.id}/add-resource`, { method: "POST", body: form })
      .then(async (res) => {
        if (!res.ok) {
          const msg = (await res.json().catch(() => ({}))).error || "Upload failed.";
          throw new Error(msg);
        }
        toast({ title: "Resource added", description: "Merging it into your course…" });
        onReload(); // course is now ready=false → processing view + polling
      })
      .catch((err) =>
        toast({ title: "Could not add resource", description: err.message, variant: "destructive" })
      )
      .finally(() => setAdding(false));
  }

  const allTopics = course.subjects.flatMap((s) =>
    s.chapters.flatMap((c) => c.topics)
  );
  const total = allTopics.length;
  const statusOf = (topicId: string): TopicStatus =>
    progress?.topics[topicId]?.status ?? "not_started";
  const done = allTopics.filter((t) =>
    ["completed", "mastered"].includes(statusOf(t.id))
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const firstTopic = allTopics[0];
  const resumeId = progress?.lastTopicId ?? firstTopic?.id;

  const coveragePct = course.coverage.totalSourceUnits
    ? Math.round(
        (course.coverage.mappedSourceUnits / course.coverage.totalSourceUnits) * 100
      )
    : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={course.title}
        description={course.description || "Your generated course outline"}
        actions={
          <>
            <input
              ref={addInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => addResource(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              onClick={() => addInputRef.current?.click()}
              disabled={adding}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add material
            </Button>
            {resumeId && (
              <Button asChild>
                <Link href={`/learn/${course.id}/${resumeId}`}>
                  <GraduationCap className="h-4 w-4" />
                  {progress?.lastTopicId ? "Resume learning" : "Learn step-by-step"}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <CourseExams
        courseId={course.id}
        chapters={course.subjects.flatMap((s) =>
          s.chapters.map((c) => ({
            id: c.id,
            title: c.title,
            topicCount: c.topics.length,
          }))
        )}
        exams={course.exams ?? []}
        onSaved={onReload}
      />

      {/* With exams set, pacing follows the exams — no separate plan date needed. */}
      {(course.exams ?? []).length === 0 && (
        <CoursePlan
          courseId={course.id}
          initialTargetDate={course.planTargetDate}
          remaining={Math.max(0, total - done)}
        />
      )}

      {/* Stats row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Topics</p>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-2xl font-bold">{pct}%</p>
            <Progress value={pct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Source coverage</p>
            <p className="text-2xl font-bold">{coveragePct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {course.coverage.mappedSourceUnits}/{course.coverage.totalSourceUnits} pages mapped
            </p>
          </CardContent>
        </Card>
      </div>

      {course.coverage.flaggedGaps.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Possible gaps flagged during analysis
          </p>
          <ul className="ml-6 list-disc text-muted-foreground">
            {course.coverage.flaggedGaps.slice(0, 6).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Outline */}
      <div className="space-y-6">
        {course.subjects.map((subject) => (
          <div key={subject.id}>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              {subject.title}
            </h2>
            <Accordion type="multiple" className="space-y-2">
              {subject.chapters.map((chapter) => (
                <AccordionItem
                  key={chapter.id}
                  value={chapter.id}
                  className="rounded-lg border border-border bg-background px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center justify-between pr-3">
                      <span className="text-left font-medium">{chapter.title}</span>
                      <Badge variant="secondary" className="ml-3 shrink-0">
                        {chapter.topics.length} topics
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 pb-2">
                      {chapter.topics.map((topic) => {
                        const st = statusOf(topic.id);
                        const meta = STATUS_META[st];
                        return (
                          <li
                            key={topic.id}
                            className="rounded-lg border border-border/70 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{topic.title}</span>
                                  <Badge variant={meta.badge}>{meta.label}</Badge>
                                </div>
                                {topic.summary && (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {topic.summary}
                                  </p>
                                )}
                                {topic.subtopics.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {topic.subtopics.map((sub, i) => (
                                      <span
                                        key={i}
                                        className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                                      >
                                        {sub}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {topic.sources.length > 0 && (
                                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <FileText className="h-3 w-3" />
                                    Source: p.
                                    {topic.sources
                                      .map((s) => s.page)
                                      .slice(0, 6)
                                      .join(", ")}
                                  </p>
                                )}
                              </div>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                              >
                                <Link href={`/learn/${course.id}/${topic.id}`}>
                                  Learn
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Course ready · grounded in your uploaded material
        </p>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-muted-foreground">
          <Trash2 className="h-4 w-4" />
          Delete course
        </Button>
      </div>
    </div>
  );
}
