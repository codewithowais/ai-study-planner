import type { Course, CourseProgress, TopicStatus } from "@/lib/types";

export interface TopicRef {
  id: string;
  title: string;
  chapterTitle: string;
  status: TopicStatus;
  lastScore: number | null;
  /** ISO timestamp the topic was last opened (for "done today" tallies). */
  lastVisited?: string;
}

export interface CourseStats {
  total: number;
  counts: Record<TopicStatus, number>;
  completedOrMastered: number;
  progressPct: number;
  readinessPct: number;
  readinessLabel: "Not ready" | "Getting there" | "Almost ready" | "Exam ready";
  weakTopics: TopicRef[];
  masteredTopics: TopicRef[];
  /** Completed/mastered topics whose spaced-repetition review is due. */
  reviewDue: TopicRef[];
  allTopics: TopicRef[];
  resumeId: string | null;
  lastTopicId: string | null;
}

const WEIGHT: Record<TopicStatus, number> = {
  not_started: 0,
  learning: 0.2,
  weak: 0.3,
  completed: 0.75,
  mastered: 1,
};

export function computeCourseStats(
  course: Course,
  progress: CourseProgress | null
): CourseStats {
  const counts: Record<TopicStatus, number> = {
    not_started: 0,
    learning: 0,
    weak: 0,
    completed: 0,
    mastered: 0,
  };

  const allTopics: TopicRef[] = [];
  const reviewDue: TopicRef[] = [];
  const now = Date.now();
  let weightSum = 0;

  for (const s of course.subjects)
    for (const c of s.chapters)
      for (const t of c.topics) {
        const entry = progress?.topics[t.id];
        const status: TopicStatus = entry?.status ?? "not_started";
        counts[status]++;
        weightSum += WEIGHT[status];
        const ref: TopicRef = {
          id: t.id,
          title: t.title,
          chapterTitle: c.title,
          status,
          lastScore: entry?.scores?.length
            ? entry.scores[entry.scores.length - 1]
            : null,
          lastVisited: entry?.lastVisited,
        };
        allTopics.push(ref);
        if (
          (status === "completed" || status === "mastered") &&
          entry?.nextReviewAt &&
          new Date(entry.nextReviewAt).getTime() <= now
        ) {
          reviewDue.push(ref);
        }
      }

  const total = allTopics.length;
  const completedOrMastered = counts.completed + counts.mastered;
  const progressPct = total ? Math.round((completedOrMastered / total) * 100) : 0;
  const readinessPct = total ? Math.round((weightSum / total) * 100) : 0;

  const readinessLabel: CourseStats["readinessLabel"] =
    readinessPct >= 80
      ? "Exam ready"
      : readinessPct >= 55
        ? "Almost ready"
        : readinessPct >= 30
          ? "Getting there"
          : "Not ready";

  const firstTopic = allTopics[0]?.id ?? null;
  const resumeId = progress?.lastTopicId ?? firstTopic;

  return {
    total,
    counts,
    completedOrMastered,
    progressPct,
    readinessPct,
    readinessLabel,
    weakTopics: allTopics.filter((t) => t.status === "weak"),
    masteredTopics: allTopics.filter((t) => t.status === "mastered"),
    reviewDue,
    allTopics,
    resumeId,
    lastTopicId: progress?.lastTopicId ?? null,
  };
}
