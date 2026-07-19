"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { SourceDrawer } from "@/components/source-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MockReviewQ {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  selectedIndex: number;
  correct: boolean;
  explanation: string;
  source: { page: number } | null;
}

/**
 * The graded mock-exam review — score card + per-question breakdown with
 * clickable source pages. Shared between the live "you just finished" view and
 * the "reopen a past mock" page; the only difference is the footer `actions`.
 */
export function MockReview({
  courseId,
  score,
  correctCount,
  total,
  results,
  actions,
}: {
  courseId: string;
  score: number;
  correctCount: number;
  total: number;
  results: MockReviewQ[];
  actions?: React.ReactNode;
}) {
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const pass = score >= 60;

  return (
    <>
      <SourceDrawer courseId={courseId} page={sourcePage} onClose={() => setSourcePage(null)} />
      <Card className="mb-6 overflow-hidden">
        <div
          className={cn(
            "flex flex-col items-center gap-2 p-8 text-center",
            pass ? "bg-success/10" : "bg-warning/10"
          )}
        >
          <div className="text-5xl font-bold">{score}%</div>
          <p className="text-sm text-muted-foreground">
            {correctCount} of {total} correct
          </p>
          <Badge variant={pass ? "success" : "warning"} className="mt-1">
            {pass ? "Passed" : "Keep practicing"}
          </Badge>
        </div>
      </Card>
      <h2 className="mb-3 text-lg font-semibold">Review</h2>
      <div className="space-y-4">
        {results.map((q, i) => (
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
                  {q.source && (
                    <button
                      onClick={() => setSourcePage(q.source!.page)}
                      className="ml-1 rounded bg-background/70 px-1.5 py-0.5 text-xs font-medium text-primary transition hover:bg-accent"
                      title="View this page from your material"
                    >
                      p.{q.source.page}
                    </button>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {actions && (
        <div className="mt-8 flex flex-wrap justify-center gap-2 border-t border-border pt-6">
          {actions}
        </div>
      )}
    </>
  );
}
