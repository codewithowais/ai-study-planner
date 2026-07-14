"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  RotateCw,
  Check,
  X,
  Layers,
  ArrowLeft,
  ClipboardList,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Generating } from "@/components/generating";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";

type Card = { front: string; back: string };
type Phase = "loading" | "error" | "studying" | "done";

export default function FlashcardsPage() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [gotIt, setGotIt] = useState(0);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(
    async (regenerate = false) => {
      setPhase(regenerate ? "studying" : "loading");
      setRegenerating(regenerate);
      setError(null);
      try {
        const res = await api.post<{ topicTitle: string; cards: Card[] }>(
          "/api/learn/flashcards",
          { courseId, topicId, regenerate }
        );
        if (res.cards.length === 0) throw new ApiError("No flashcards were generated.", 502);
        setTitle(res.topicTitle);
        setCards(res.cards);
        setIndex(0);
        setFlipped(false);
        setGotIt(0);
        setPhase("studying");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to build flashcards.");
        setPhase("error");
      } finally {
        setRegenerating(false);
      }
    },
    [courseId, topicId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const grade = useCallback(
    (got: boolean) => {
      const finalGot = gotIt + (got ? 1 : 0);
      if (got) setGotIt((g) => g + 1);
      if (index + 1 >= cards.length) {
        setPhase("done");
        // Feed the session recall into spaced repetition (fire-and-forget).
        api
          .post("/api/learn/flashcards/grade", {
            courseId,
            topicId,
            gotIt: finalGot,
            total: cards.length,
          })
          .catch(() => undefined);
      } else {
        setIndex((i) => i + 1);
        setFlipped(false);
      }
    },
    [index, cards.length, gotIt, courseId, topicId]
  );

  // Keyboard: Space/Enter flips; once flipped, ←/1 = still learning, →/2 = got it.
  useEffect(() => {
    if (phase !== "studying") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === "ArrowRight" || e.key === "2")) {
        grade(true);
      } else if (flipped && (e.key === "ArrowLeft" || e.key === "1")) {
        grade(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, flipped, grade]);

  if (phase === "loading") {
    return (
      <Generating
        icon={Layers}
        title="Building your flashcards"
        steps={[
          "Pulling out the key ideas",
          "Writing recall prompts",
          "Shuffling your deck",
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
              <Button onClick={() => load()}>
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

  if (phase === "done") {
    const pct = cards.length ? Math.round((gotIt / cards.length) * 100) : 0;
    return (
      <div className="mx-auto max-w-md text-center">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-2 bg-primary/5 p-8">
            <div className="text-5xl font-bold">{pct}%</div>
            <p className="text-sm text-muted-foreground">
              You recalled {gotIt} of {cards.length} cards
            </p>
          </div>
          <CardContent className="flex flex-col gap-2 p-5">
            <Button onClick={() => load()}>
              <RotateCw className="h-4 w-4" />
              Study again
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/quiz/${courseId}/${topicId}`}>
                <ClipboardList className="h-4 w-4" />
                Test yourself with a quiz
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/learn/${courseId}/${topicId}`}>
                <GraduationCap className="h-4 w-4" />
                Back to lesson
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/learn/${courseId}/${topicId}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {title}
        </Link>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={regenerating}>
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          New cards
        </Button>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <span className="flex items-center gap-1 text-success">
          <Check className="h-3.5 w-3.5" />
          {gotIt}
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(index / cards.length) * 100}%` }}
        />
      </div>

      {/* Flip card — real 3D flip */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="block w-full [perspective:1400px]"
        aria-label={flipped ? "Show question" : "Reveal answer"}
      >
        <div
          className={cn(
            "relative min-h-[280px] w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* Front (question) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-background p-8 text-center [backface-visibility:hidden]">
            <span className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question
            </span>
            <span className="text-lg font-medium leading-relaxed">{card.front}</span>
            <span className="mt-6 text-xs text-muted-foreground">Tap to reveal the answer</span>
          </div>
          {/* Back (answer) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/40 bg-accent/50 p-8 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">
              Answer
            </span>
            <span className="text-lg font-medium leading-relaxed">{card.back}</span>
            <span className="mt-6 text-xs text-muted-foreground">How did you do?</span>
          </div>
          {/* Spacer to give the absolute faces height */}
          <div className="min-h-[280px] w-full" aria-hidden />
        </div>
      </button>

      {/* Grade */}
      <div className="mt-5 flex gap-3">
        <Button
          variant="outline"
          className="flex-1 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
          disabled={!flipped}
          onClick={() => grade(false)}
        >
          <X className="h-4 w-4" />
          Still learning
        </Button>
        <Button
          variant="success"
          className="flex-1"
          disabled={!flipped}
          onClick={() => grade(true)}
        >
          <Check className="h-4 w-4" />
          Got it
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {flipped
          ? "Keyboard: ← still learning · → got it"
          : "Reveal the answer to grade yourself · press Space to flip"}
      </p>
    </div>
  );
}
