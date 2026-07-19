"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MockReview } from "@/components/mock-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/client";

interface ExamSummary {
  id: string;
  name: string;
  date: string;
}
interface CourseSummary {
  id: string;
  title: string;
  ready: boolean;
  error: string | null;
  topicCount: number;
  exams?: ExamSummary[];
}

function nextExamId(course: CourseSummary | undefined): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (course?.exams ?? [])
    .filter((e) => new Date(e.date + "T00:00:00").getTime() >= today.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0]?.id ?? "full";
}
interface Question {
  id: string;
  prompt: string;
  choices: string[];
}
interface GradedQ {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  selectedIndex: number;
  correct: boolean;
  explanation: string;
  source: { page: number } | null;
}
interface SubmitResp {
  score: number;
  correctCount: number;
  total: number;
  results: GradedQ[];
}

type Phase = "pick" | "generating" | "taking" | "submitting" | "done" | "error";

export default function MockExamPage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [scope, setScope] = useState<string>("full");
  const [count, setCount] = useState(10);
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitResp | null>(null);

  useEffect(() => {
    // The planner's "Take a mock" links pass ?course=&exam= so we open the
    // right scope; otherwise default to the first ready course + nearest exam.
    const params = new URLSearchParams(window.location.search);
    const wantCourse = params.get("course");
    const wantExam = params.get("exam");
    api
      .get<{ courses: CourseSummary[] }>("/api/courses?active=1")
      .then((r) => {
        const ready = r.courses.filter((c) => c.ready && !c.error);
        setCourses(ready);
        const picked = (wantCourse && ready.find((c) => c.id === wantCourse)) || ready[0];
        if (picked) {
          setCourseId(picked.id);
          const examOk = !!wantExam && (picked.exams ?? []).some((e) => e.id === wantExam);
          setScope(examOk ? wantExam : nextExamId(picked));
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load courses."));
  }, []);

  async function generateExam() {
    setPhase("generating");
    setError(null);
    setAnswers({});
    setResult(null);
    try {
      const res = await api.post<{ attemptId: string; questions: Question[] }>(
        "/api/mock/generate",
        { courseId, count, examId: scope === "full" ? undefined : scope }
      );
      setAttemptId(res.attemptId);
      setQuestions(res.questions);
      setPhase("taking");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate exam.");
      setPhase("error");
    }
  }

  async function submit() {
    setPhase("submitting");
    try {
      const res = await api.post<SubmitResp>("/api/quiz/submit", {
        attemptId,
        answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({
          questionId,
          selectedIndex,
        })),
      });
      setResult(res);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit exam.");
      setPhase("error");
    }
  }

  // --- Render ---

  if (phase === "generating") {
    return (
      <Centered
        icon={<ClipboardList className="h-7 w-7 animate-pulse text-primary" />}
        title="Building your mock exam"
        subtitle="Sampling questions from across the whole course…"
        spinner
      />
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{error}</p>
            <Button onClick={() => setPhase("pick")}>
              <RefreshCw className="h-4 w-4" />
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="mx-auto max-w-3xl">
        <MockReview
          courseId={courseId}
          score={result.score}
          correctCount={result.correctCount}
          total={result.total}
          results={result.results}
          actions={
            <>
              <Button variant="outline" onClick={() => setPhase("pick")}>
                New mock exam
              </Button>
              <Button asChild>
                <Link href="/progress">View progress</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (phase === "taking" || phase === "submitting") {
    const answered = Object.keys(answers).length;
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Mock exam" description={`${answered} of ${questions.length} answered`} />
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(answered / questions.length) * 100}%` }}
          />
        </div>
        <div className="space-y-4">
          {questions.map((q, i) => (
            <Card key={q.id}>
              <CardContent className="p-5">
                <p className="mb-3 font-medium">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {q.prompt}
                </p>
                <RadioGroup
                  value={answers[q.id]?.toString() ?? ""}
                  onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
                  className="space-y-2"
                >
                  {q.choices.map((c, ci) => (
                    <Label
                      key={ci}
                      htmlFor={`${q.id}-${ci}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-accent"
                    >
                      <RadioGroupItem id={`${q.id}-${ci}`} value={ci.toString()} />
                      <span className="text-sm font-normal">{c}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {answered < questions.length
              ? `${questions.length - answered} left`
              : "All answered"}
          </p>
          <Button onClick={submit} disabled={answered < questions.length || phase === "submitting"}>
            {phase === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit exam
          </Button>
        </div>
      </div>
    );
  }

  // pick
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Mock exam"
        description="Test yourself with a timed-style exam sampled across a whole course."
      />
      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {!courses ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No courses to examine"
          description="Generate a course first, then come back for a full mock exam."
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
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <Label>Course</Label>
              <RadioGroup
                value={courseId}
                onValueChange={(id) => {
                  setCourseId(id);
                  setScope(nextExamId(courses?.find((c) => c.id === id)));
                }}
                className="space-y-2"
              >
                {courses.map((c) => (
                  <Label
                    key={c.id}
                    htmlFor={`c-${c.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-accent"
                  >
                    <RadioGroupItem id={`c-${c.id}`} value={c.id} />
                    <div>
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.topicCount} topics</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>
            {(() => {
              const selected = courses.find((c) => c.id === courseId);
              const exams = selected?.exams ?? [];
              if (exams.length === 0) return null;
              return (
                <div className="space-y-2">
                  <Label>Exam scope</Label>
                  <div className="flex flex-wrap gap-2">
                    {[...exams]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((e) => (
                        <Button
                          key={e.id}
                          type="button"
                          variant={scope === e.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setScope(e.id)}
                        >
                          {e.name}
                          {scope === e.id && nextExamId(selected) === e.id ? " · next" : ""}
                        </Button>
                      ))}
                    <Button
                      type="button"
                      variant={scope === "full" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setScope("full")}
                    >
                      Full course
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Questions come only from what that exam covers — practice the way
                    you&apos;ll be tested.
                  </p>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Number of questions</Label>
              <div className="flex gap-2">
                {[5, 10, 15].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={count === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={generateExam} disabled={!courseId}>
              <ClipboardList className="h-4 w-4" />
              Start mock exam
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Centered({
  icon,
  title,
  subtitle,
  spinner,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  spinner?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        {icon}
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {spinner && <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted-foreground" />}
    </div>
  );
}
