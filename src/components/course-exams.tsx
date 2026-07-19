"use client";

import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  CalendarClock,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";
import { daysLeftUntil, prettyDate, addDaysISO } from "@/lib/plan-dates";
import type { CourseExam } from "@/lib/types";

interface ChapterRef {
  id: string;
  title: string;
  topicCount: number;
}

/**
 * "Add your exams" — the student tells us when the midterm/final is and what
 * it covers; pacing, mock scope, and readiness all derive from it. Designed so
 * a beginner can accept the defaults in three taps, while an advanced student
 * can name exams freely and fine-tune coverage per chapter.
 */
export function CourseExams({
  courseId,
  chapters,
  exams,
  onSaved,
}: {
  courseId: string;
  chapters: ChapterRef[];
  exams: CourseExam[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<CourseExam | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  async function persist(next: CourseExam[], message: string) {
    setSaving(true);
    try {
      await api.patch(`/api/courses/${courseId}`, { exams: next });
      toast({ title: message });
      setEditing(null);
      onSaved();
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-accent/40 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="h-4 w-4 text-primary" />
          Your exams
        </p>
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Add exam
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tell us when your midterm or final is and which modules it covers — your
          daily sessions, mock exams, and readiness will follow it automatically.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sorted.map((exam) => {
            const left = daysLeftUntil(exam.date);
            const covered = chapters.filter((c) => exam.chapterIds.includes(c.id));
            const coverage =
              covered.length === chapters.length
                ? "Whole course"
                : covered.length === 0
                  ? "No modules"
                  : covered.length === 1
                    ? covered[0].title
                    : `${covered[0].title} → ${covered[covered.length - 1].title}`;
            return (
              <li
                key={exam.id}
                className="flex items-center gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-border"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {/* div, not p: Badge renders a div and div-in-p is invalid HTML (hydration warning) */}
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {exam.name}
                    {left < 0 ? (
                      <Badge variant="secondary">Passed</Badge>
                    ) : (
                      <Badge variant={left <= 7 ? "warning" : "secondary"}>
                        {left === 0 ? "Today!" : `${left} day${left === 1 ? "" : "s"} left`}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {prettyDate(exam.date)} · Covers: {coverage}
                    {exam.includeEarlierShare
                      ? " · mocks include some earlier topics"
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${exam.name}`}
                    onClick={() => setEditing(exam)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${exam.name}`}
                    disabled={saving}
                    onClick={() =>
                      persist(
                        exams.filter((e) => e.id !== exam.id),
                        `${exam.name} removed`
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <ExamDialog
          chapters={chapters}
          exams={exams}
          exam={editing === "new" ? null : editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={(exam) => {
            const others = exams.filter((e) => e.id !== exam.id);
            persist([...others, exam], `${exam.name} saved`);
          }}
        />
      )}
    </div>
  );
}

function ExamDialog({
  chapters,
  exams,
  exam,
  saving,
  onClose,
  onSave,
}: {
  chapters: ChapterRef[];
  exams: CourseExam[];
  exam: CourseExam | null;
  saving: boolean;
  onClose: () => void;
  onSave: (exam: CourseExam) => void;
}) {
  const otherCovered = useMemo(() => {
    const set = new Set<string>();
    for (const e of exams) {
      if (exam && e.id === exam.id) continue;
      for (const id of e.chapterIds) set.add(id);
    }
    return set;
  }, [exams, exam]);

  // Smart defaults: first exam = "Midterm" covering the first half; the next
  // exam = "Final" covering whatever isn't covered yet, with the real-exam
  // "includes some earlier topics" behavior on.
  const isFirstExam = exams.length === 0 || (exam !== null && exams.length === 1);
  const defaultSelected = () => {
    if (exam) return new Set(exam.chapterIds);
    if (otherCovered.size === 0) {
      const half = Math.max(1, Math.ceil(chapters.length / 2));
      return new Set(chapters.slice(0, half).map((c) => c.id));
    }
    return new Set(chapters.filter((c) => !otherCovered.has(c.id)).map((c) => c.id));
  };

  const [name, setName] = useState(exam?.name ?? (otherCovered.size === 0 ? "Midterm" : "Final"));
  const [date, setDate] = useState(exam?.date ?? "");
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);
  const [mixEarlier, setMixEarlier] = useState(
    exam ? (exam.includeEarlierShare ?? 0) > 0 : otherCovered.size > 0
  );

  const firstSelectedIdx = chapters.findIndex((c) => selected.has(c.id));
  const hasEarlier = firstSelectedIdx > 0;
  const selectedTopics = chapters
    .filter((c) => selected.has(c.id))
    .reduce((n, c) => n + c.topicCount, 0);

  const quick = (mode: "first-half" | "second-half" | "all" | "remaining") => {
    const half = Math.max(1, Math.ceil(chapters.length / 2));
    if (mode === "first-half") setSelected(new Set(chapters.slice(0, half).map((c) => c.id)));
    else if (mode === "second-half") setSelected(new Set(chapters.slice(half).map((c) => c.id)));
    else if (mode === "all") setSelected(new Set(chapters.map((c) => c.id)));
    else setSelected(new Set(chapters.filter((c) => !otherCovered.has(c.id)).map((c) => c.id)));
  };

  const canSave = name.trim().length > 0 && date.length > 0 && selected.size > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            {exam ? `Edit ${exam.name}` : "Add exam"}
          </DialogTitle>
          <DialogDescription>
            When is it, and what does it cover? Everything else — daily pacing, mock
            exams, readiness — follows automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Exam name</Label>
          <div className="flex flex-wrap items-center gap-2">
            {["Midterm", "Final"].map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={name === preset ? "default" : "outline"}
                onClick={() => setName(preset)}
              >
                {preset}
              </Button>
            ))}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Or type your own…"
              className="h-9 w-40"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-date">Exam date</Label>
          <Input
            id="exam-date"
            type="date"
            value={date}
            min={addDaysISO(0)}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>What it covers</Label>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => quick("first-half")}>
                First half
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => quick("second-half")}>
                Second half
              </Button>
              {otherCovered.size > 0 && (
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => quick("remaining")}>
                  Remaining
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => quick("all")}>
                Everything
              </Button>
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {chapters.map((c) => (
              <label
                key={c.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-secondary",
                  selected.has(c.id) && "bg-accent"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    });
                  }}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.topicCount} topic{c.topicCount === 1 ? "" : "s"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.size} module{selected.size === 1 ? "" : "s"} · {selectedTopics} topic
            {selectedTopics === 1 ? "" : "s"} selected
          </p>
        </div>

        {hasEarlier && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
            <input
              type="checkbox"
              checked={mixEarlier}
              onChange={(e) => setMixEarlier(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="font-medium">Include ~20% earlier topics in mock exams</span>
              <span className="block text-xs text-muted-foreground">
                Real finals usually include some pre-midterm content — keep this on to
                practice the way you&apos;ll be tested.
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || saving}
            onClick={() =>
              onSave({
                id: exam?.id ?? nanoid(10),
                name: name.trim(),
                date,
                chapterIds: chapters.filter((c) => selected.has(c.id)).map((c) => c.id),
                includeEarlierShare: hasEarlier && mixEarlier ? 0.2 : undefined,
              })
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save exam
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
