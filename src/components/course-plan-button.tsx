"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, CalendarClock, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";
import { PLAN_PRESETS, addDaysISO, daysLeftUntil, prettyDate, perDayFor } from "@/lib/plan-dates";

/**
 * Compact study-plan control for course cards: shows the deadline at a glance
 * and opens a small dialog to set / change / clear it — no need to open the
 * course first.
 */
export function CoursePlanButton({
  courseId,
  courseTitle,
  initialTargetDate,
  remaining,
  className,
}: {
  courseId: string;
  courseTitle: string;
  initialTargetDate?: string | null;
  remaining: number;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState<string | null>(initialTargetDate ?? null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(date: string | null) {
    setSaving(true);
    try {
      await api.patch(`/api/courses/${courseId}`, { planTargetDate: date });
      setTarget(date);
      setOpen(false);
      setCustom("");
      toast({
        title: date ? "Study plan set" : "Study plan cleared",
        description: date ? `Aiming to finish by ${prettyDate(date)}.` : undefined,
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

  const left = target ? daysLeftUntil(target) : null;
  const overdue = left !== null && left < 0;

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition",
          target && !overdue
            ? "bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15"
            : overdue
              ? "bg-warning/10 text-warning ring-warning/30 hover:bg-warning/15"
              : "bg-secondary text-muted-foreground ring-transparent hover:text-foreground",
          className
        )}
        title="Set a study deadline"
      >
        {target ? <CalendarClock className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
        {target
          ? overdue
            ? "Plan overdue"
            : left === 0
              ? "Due today"
              : `${left}d left`
          : "Set study plan"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Study plan
            </DialogTitle>
            <DialogDescription>
              How long do you want to give <span className="font-medium">{courseTitle}</span>? We&apos;ll
              pace Today&apos;s Session to finish {remaining} remaining topic{remaining === 1 ? "" : "s"} in time.
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="rounded-lg bg-secondary/60 px-3 py-2 text-sm">
              {overdue
                ? `Current target passed (${prettyDate(target)}).`
                : `Current target: ${prettyDate(target)} · about ${perDayFor(remaining, left ?? 0)} topic${perDayFor(remaining, left ?? 0) === 1 ? "" : "s"}/day.`}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {PLAN_PRESETS.map((p) => (
              <Button
                key={p.days}
                variant="outline"
                disabled={saving}
                onClick={() => save(addDaysISO(p.days))}
                className="justify-between"
              >
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">~{perDayFor(remaining, p.days)}/day</span>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={custom}
              min={addDaysISO(1)}
              onChange={(e) => setCustom(e.target.value)}
              className="h-9"
            />
            <Button size="sm" disabled={saving || !custom} onClick={() => save(custom)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Set
            </Button>
          </div>

          {target && (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => save(null)} className="self-start text-muted-foreground">
              Clear plan
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
