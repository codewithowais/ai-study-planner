import type { TopicStatus } from "@/lib/types";

export const STATUS_META: Record<
  TopicStatus,
  { label: string; badge: "secondary" | "default" | "success" | "warning" | "destructive" }
> = {
  not_started: { label: "Not started", badge: "secondary" },
  learning: { label: "Learning", badge: "default" },
  completed: { label: "Completed", badge: "success" },
  weak: { label: "Needs work", badge: "warning" },
  mastered: { label: "Mastered", badge: "success" },
};

export function scoreLabel(score: number): string {
  if (score >= 85) return "Mastered";
  if (score >= 60) return "Good";
  return "Needs work";
}
