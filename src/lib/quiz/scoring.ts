import type { TopicStatus } from "@/lib/types";

/** Map a quiz score (0..100) to a topic status. */
export function statusFromScore(score: number): TopicStatus {
  if (score >= 85) return "mastered";
  if (score >= 60) return "completed";
  return "weak";
}

/**
 * SM-2-lite spaced-repetition scheduler. A stronger score pushes the next
 * review further out; a weak score brings it back tomorrow. Returns the new
 * interval (days) and the next-due date.
 */
export function computeNextReview(
  score: number,
  prevInterval: number | undefined
): { interval: number; nextReviewAt: string } {
  let interval: number;
  if (score < 60) {
    interval = 1; // missed it — see it again tomorrow
  } else if (!prevInterval || prevInterval < 1) {
    interval = score >= 85 ? 4 : 2; // first pass
  } else {
    // grow the gap: mastered expands faster than merely completed
    const factor = score >= 85 ? 2.5 : 1.6;
    interval = Math.min(180, Math.round(prevInterval * factor));
  }
  const due = new Date();
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + interval);
  return { interval, nextReviewAt: due.toISOString() };
}

export interface PendingQuiz {
  attemptId: string;
  userId: string;
  courseId: string;
  topicId: string;
  kind: "topic" | "mock";
  createdAt: string;
  questions: {
    id: string;
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
    source?: { file: string; page: number; snippet: string };
  }[];
}
