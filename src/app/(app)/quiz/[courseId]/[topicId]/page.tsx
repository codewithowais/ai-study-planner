"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  GraduationCap,
  ClipboardList,
  FileText,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";
import { STATUS_META } from "@/lib/status";
import { SourceDrawer } from "@/components/source-drawer";
import { Generating } from "@/components/generating";
import type { TopicStatus } from "@/lib/types";

interface Question {
  id: string;
  prompt: string;
  choices: string[];
}
interface GenResp {
  attemptId: string;
  topicTitle: string;
  nextTopicId: string | null;
  questions: Question[];
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
  status: TopicStatus;
  results: GradedQ[];
  weakAreas: string[];
}

export default function QuizPage() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const [phase, setPhase] = useState<"loading" | "taking" | "submitting" | "done" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<GenResp | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitResp | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);

  const generate = useCallback(
    async (regenerate = false) => {
      setPhase("loading");
      setError(null);
      setAnswers({});
      setResult(null);
      try {
        // regenerate:false serves the cached quiz set on open; "Retake" passes
        // true for fresh questions.
        const res = await api.post<GenResp>("/api/quiz/generate", {
          courseId,
          topicId,
          regenerate,
        });
        setQuiz(res);
        setPhase("taking");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to generate quiz.");
        setPhase("error");
      }
    },
    [courseId, topicId]
  );

  const redo = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setAnswers({});
    setResult(null);
    try {
      const res = await api.post<GenResp>("/api/quiz/redo", { courseId, topicId });
      setQuiz(res);
      setPhase("taking");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load your missed questions.");
      setPhase("error");
    }
  }, [courseId, topicId]);

  // On open, honour ?redo=1 (from Progress/Revision "Redo missed") — re-serve
  // the exact questions missed last time; otherwise generate a fresh quiz.
  useEffect(() => {
    const wantRedo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("redo") === "1";
    if (wantRedo) redo();
    else generate();
  }, [generate, redo]);

  async function submit() {
    if (!quiz) return;
    setPhase("submitting");
    try {
      const res = await api.post<SubmitResp>("/api/quiz/submit", {
        attemptId: quiz.attemptId,
        answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({
          questionId,
          selectedIndex,
        })),
      });
      setResult(res);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit quiz.");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return (
      <Generating
        icon={ClipboardList}
        title="Building your quiz"
        steps={[
          "Reviewing the topic",
          "Writing fair questions",
          "Checking the answers",
          "Almost ready…",
        ]}
        estimate="usually 15–30 seconds"
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
            <div className="flex gap-2">
              <Button onClick={() => generate()}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href={`/learn/${courseId}/${topicId}`}>Back to lesson</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <>
        <SourceDrawer courseId={courseId} page={sourcePage} onClose={() => setSourcePage(null)} />
        <ResultsView
          result={result}
          courseId={courseId}
          topicId={topicId}
          nextTopicId={quiz?.nextTopicId ?? null}
          onRetake={() => generate(true)}
          onRedo={redo}
          onViewSource={(p) => setSourcePage(p)}
        />
      </>
    );
  }

  // taking / submitting
  const total = quiz?.questions.length ?? 0;
  const answered = Object.keys(answers).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/learn/${courseId}/${topicId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to lesson
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Quiz: {quiz?.topicTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {answered} of {total} answered
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {quiz?.questions.map((q, i) => (
          <Card key={q.id}>
            <CardContent className="p-5">
              <p className="mb-3 font-medium">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                {q.prompt}
              </p>
              <RadioGroup
                value={answers[q.id]?.toString() ?? ""}
                onValueChange={(v) =>
                  setAnswers((a) => ({ ...a, [q.id]: Number(v) }))
                }
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
          {answered < total
            ? `${total - answered} question${total - answered === 1 ? "" : "s"} left`
            : "All questions answered"}
        </p>
        <Button onClick={submit} disabled={answered < total || phase === "submitting"}>
          {phase === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit quiz
        </Button>
      </div>
    </div>
  );
}

function ResultsView({
  result,
  courseId,
  topicId,
  nextTopicId,
  onRetake,
  onRedo,
  onViewSource,
}: {
  result: SubmitResp;
  courseId: string;
  topicId: string;
  nextTopicId: string | null;
  onRetake: () => void;
  onRedo: () => void;
  onViewSource: (page: number) => void;
}) {
  const meta = STATUS_META[result.status];
  const pass = result.score >= 60;
  const wrongCount = result.results.filter((r) => !r.correct).length;

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
          <Badge variant={meta.badge} className="mt-1">
            {meta.label}
          </Badge>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {result.status === "mastered"
              ? "Excellent — you've mastered this topic."
              : result.status === "completed"
                ? "Good work. Review the misses below to lock it in."
                : "This topic needs more work. Re-learn it, then try again."}
          </p>
        </div>
      </Card>

      {result.weakAreas.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Focus areas ({result.weakAreas.length})
          </p>
          <ul className="ml-6 list-disc text-sm text-muted-foreground">
            {result.weakAreas.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Review your answers</h2>
      <div className="space-y-4">
        {result.results.map((q, i) => (
          <Card key={q.id} className={cn("border-l-4", q.correct ? "border-l-success" : "border-l-destructive")}>
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
                <div className="mt-3 rounded-md bg-secondary/60 p-3 text-sm">
                  <span className="font-medium">Why: </span>
                  {q.explanation}
                  {q.source && (
                    <button
                      onClick={() => onViewSource(q.source!.page)}
                      className="ml-1 inline-flex min-h-[28px] items-center gap-1 rounded bg-background px-1.5 py-0.5 text-xs font-medium text-primary transition hover:bg-accent"
                      title="View this page from your material"
                    >
                      <FileText className="h-3 w-3" /> p.{q.source.page}
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/learn/${courseId}/${topicId}`}>
              <GraduationCap className="h-4 w-4" />
              Re-learn
            </Link>
          </Button>
          {wrongCount > 0 && (
            <Button variant="outline" onClick={onRedo}>
              <RefreshCw className="h-4 w-4" />
              Redo wrong ({wrongCount})
            </Button>
          )}
          <Button variant="outline" onClick={onRetake}>
            <RefreshCw className="h-4 w-4" />
            Retake
          </Button>
        </div>
        {pass && nextTopicId ? (
          <Button asChild>
            <Link href={`/learn/${courseId}/${nextTopicId}`}>
              Next topic
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button asChild variant={pass ? "default" : "outline"}>
            <Link href={`/courses/${courseId}`}>Back to course</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
