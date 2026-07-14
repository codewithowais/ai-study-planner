"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Search, Check, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";
import type { Course, CourseProgress, TopicStatus } from "@/lib/types";

const DOT: Record<TopicStatus, string> = {
  not_started: "bg-muted-foreground/30",
  learning: "bg-primary",
  completed: "bg-success",
  mastered: "bg-success",
  weak: "bg-warning",
};

/**
 * Slide-over panel that lets the learner jump to any topic in the course
 * without leaving the workspace. Lazy-loads the outline the first time it opens.
 */
export function TopicNavigator({
  courseId,
  currentTopicId,
  open,
  onClose,
  onNavigate,
}: {
  courseId: string;
  currentTopicId: string;
  open: boolean;
  onClose: () => void;
  onNavigate: (topicId: string) => void;
}) {
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || course) return;
    setLoading(true);
    api
      .get<{ course: Course; progress: CourseProgress | null }>(`/api/courses/${courseId}`)
      .then((r) => {
        setCourse(r.course);
        setProgress(r.progress);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, course, courseId]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const statusOf = (id: string): TopicStatus =>
    progress?.topics[id]?.status ?? "not_started";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <p className="font-semibold">Course contents</p>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics…"
              className="h-9 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {course?.subjects.map((s) =>
            s.chapters.map((c) => {
              const topics = c.topics.filter(
                (t) => !q || t.title.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
              );
              if (topics.length === 0) return null;
              return (
                <div key={c.id} className="mb-4">
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {c.title}
                  </p>
                  <ul className="space-y-0.5">
                    {topics.map((t) => {
                      const st = statusOf(t.id);
                      const active = t.id === currentTopicId;
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => onNavigate(t.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              active
                                ? "bg-accent font-medium text-accent-foreground"
                                : "hover:bg-secondary"
                            )}
                          >
                            {st === "completed" || st === "mastered" ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                            ) : active ? (
                              <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[st])} />
                            )}
                            <span className="truncate">{t.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
