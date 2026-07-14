"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, X, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

const PRESETS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "2 months", days: 60 },
];

function addDaysISO(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function daysLeft(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pretty(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Lets the student pick how long they want to spend on a course. The chosen
 * "finish by" date paces Today's Session on the dashboard.
 */
export function CoursePlan({
  courseId,
  initialTargetDate,
  remaining,
}: {
  courseId: string;
  initialTargetDate?: string | null;
  remaining: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState<string | null>(initialTargetDate ?? null);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(date: string | null) {
    setSaving(true);
    try {
      await api.patch(`/api/courses/${courseId}`, { planTargetDate: date });
      setTarget(date);
      setEditing(false);
      setCustom("");
      toast({
        title: date ? "Study plan set" : "Study plan cleared",
        description: date ? `Aiming to finish by ${pretty(date)}.` : undefined,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not save plan",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const left = target ? daysLeft(target) : 0;
  const overdue = target && left < 0;
  const perDay = target && left > 0 ? Math.min(10, Math.max(1, Math.ceil(remaining / left))) : remaining;

  // Set/edit picker.
  if (editing || !target) {
    return (
      <div className="mb-6 rounded-2xl border border-primary/20 bg-accent/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">
            {target ? "Change your study plan" : "Set a study plan"}
          </p>
          {target && (
            <button
              onClick={() => setEditing(false)}
              className="ml-auto text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          How long do you want to give this course? We&apos;ll pace your daily sessions
          to finish {remaining} remaining topic{remaining === 1 ? "" : "s"} in time.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => save(addDaysISO(p.days))}
            >
              {p.label}
              <span className="ml-1 text-xs text-muted-foreground">
                (~{Math.min(10, Math.max(1, Math.ceil(remaining / p.days)))}/day)
              </span>
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={custom}
              min={addDaysISO(1)}
              onChange={(e) => setCustom(e.target.value)}
              className="h-9 w-[150px]"
            />
            <Button size="sm" disabled={saving || !custom} onClick={() => save(custom)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Set date
            </Button>
          </div>
          {target && (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
              Clear plan
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Active plan summary.
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            {overdue
              ? `Target passed (${pretty(target)})`
              : `Finish by ${pretty(target)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {overdue
              ? `${remaining} topic${remaining === 1 ? "" : "s"} still to go — pick a new date.`
              : left === 0
                ? `Due today · ${remaining} topic${remaining === 1 ? "" : "s"} left`
                : `${left} day${left === 1 ? "" : "s"} left · about ${perDay} topic${perDay === 1 ? "" : "s"}/day`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
          Clear
        </Button>
      </div>
    </div>
  );
}
