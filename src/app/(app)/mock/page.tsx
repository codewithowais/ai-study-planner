"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";

interface CourseSummary {
  id: string;
  title: string;
  ready: boolean;
  error: string | null;
  topicCount: number;
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
  const [count, setCount] = useState(10);
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitResp | null>(null);

  useEffect(() => {
    api
      .get<{ courses: CourseSummary[] }>("/api/courses?active=1")
      .then((r) => {
        const ready = r.courses.filter((c) => c.ready && !c.error);
        setCourses(ready);
        if (ready[0]) setCourseId(ready[0].id);
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
        { courseId, count }
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
    const pass = result.score >= 60;
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="mb-6 overflow-hidden">
          <div
            className={cn(
              "flex flex-col items-center gap-2 p-8 text-center",
              pass ? "bg-success/10" : "bg-warning/10"
            )}
          >
            <div className="text-5xl font-bold">{result.score}%</div>
            <p className="text-sm text-muted-foreground">
              {result.correctCount} of {result.total} correct
            </p>
            <Badge variant={pass ? "success" : "warning"} className="mt-1">
              {pass ? "Passed" : "Keep practicing"}
            </Badge>
          </div>
        </Card>
        <h2 className="mb-3 text-lg font-semibold">Review</h2>
        <div className="space-y-4">
          {result.results.map((q, i) => (
            <Card
              key={q.id}
              className={cn("border-l-4", q.correct ? "border-l-success" : "border-l-destructive")}
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-start gap-2">
                  {q.correct ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <p className="font-medium">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {q.prompt}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {q.choices.map((c, ci) => {
                    const isCorrect = ci === q.correctIndex;
                    const isChosen = ci === q.selectedIndex;
                    return (
                      <div
                        key={ci}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                          isCorrect && "border-success/50 bg-success/10",
                          isChosen && !isCorrect && "border-destructive/50 bg-destructive/10",
                          !isCorrect && !isChosen && "border-transparent"
                        )}
                      >
                        <span className="flex-1">{c}</span>
                        {isCorrect && <span className="text-xs font-medium text-success">Correct</span>}
                        {isChosen && !isCorrect && (
                          <span className="text-xs font-medium text-destructive">Your answer</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <p className="mt-3 rounded-md bg-secondary/60 p-3 text-sm">
                    <span className="font-medium">Why: </span>
                    {q.explanation}
                    {q.source ? ` (p.${q.source.page})` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-2 border-t border-border pt-6">
          <Button variant="outline" onClick={() => setPhase("pick")}>
            New mock exam
          </Button>
          <Button asChild>
            <Link href="/progress">View progress</Link>
          </Button>
        </div>
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
              <RadioGroup value={courseId} onValueChange={setCourseId} className="space-y-2">
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
