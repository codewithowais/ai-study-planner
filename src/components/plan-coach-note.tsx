"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { api } from "@/lib/client";

/** The AI study-coach note on the planner. Fetched client-side so the page
 * paints instantly; the note is cached server-side by a coarse progress bucket,
 * so it only regenerates when something material changes. */
export function PlanCoachNote({
  courseId,
  examId,
  intensity,
}: {
  courseId: string;
  examId: string;
  intensity: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(regenerate = false) {
    setLoading(true);
    api
      .post<{ note: string }>("/api/plan/coach", { courseId, examId, intensity, regenerate })
      .then((r) => setNote(r.note))
      .catch(() => setNote(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // Re-fetch when the focus exam or intensity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, examId, intensity]);

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-accent/40 p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Your coach
        </p>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          title="Fresh take"
          aria-label="Refresh coach note"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {loading && !note ? (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Thinking about your game plan…
        </div>
      ) : note ? (
        <p className="text-[15px] leading-relaxed text-foreground/90">{note}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Coach note unavailable right now — make sure your AI companion is running.
        </p>
      )}
    </div>
  );
}
