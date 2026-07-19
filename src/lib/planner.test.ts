import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExamPlan } from "./planner.ts";
import type { CourseStats, TopicRef } from "./progress-stats.ts";
import type { Course, CourseExam, TopicStatus } from "./types.ts";

function topicRef(id: string, status: TopicStatus): TopicRef {
  return { id, title: `Topic ${id}`, chapterTitle: "Chapter 1", status, lastScore: null, scores: [], wrongCount: 0 };
}

function courseWith(topicIds: string[]): Course {
  return {
    id: "c1",
    userId: "u1",
    title: "Test Course",
    description: "",
    subjects: [
      {
        id: "s1",
        title: "S1",
        chapters: [
          {
            id: "ch1",
            title: "Chapter 1",
            topics: topicIds.map((id) => ({ id, title: `Topic ${id}`, subtopics: [], summary: "x", sources: [] })),
          },
        ],
      },
    ],
    coverage: { totalSourceUnits: 0, mappedSourceUnits: 0, notes: "", flaggedGaps: [] },
    resourceIds: [],
    createdAt: "2026-01-01",
    ready: true,
  };
}

function statsWith(topics: TopicRef[], lastTopicId: string | null = null): CourseStats {
  return {
    total: topics.length,
    counts: { not_started: 0, learning: 0, weak: 0, completed: 0, mastered: 0 },
    completedOrMastered: 0,
    progressPct: 0,
    readinessPct: 0,
    readinessLabel: "Not ready",
    weakTopics: topics.filter((t) => t.status === "weak"),
    masteredTopics: [],
    reviewDue: [],
    allTopics: topics,
    resumeId: topics[0]?.id ?? null,
    lastTopicId,
  };
}

const exam = (date: string): CourseExam => ({ id: "e1", name: "Midterm", date, chapterIds: ["ch1"] });

test("paces topics evenly and marks the exam day", () => {
  const ids = ["t1", "t2", "t3"];
  const plan = buildExamPlan(
    courseWith(ids),
    statsWith(ids.map((id) => topicRef(id, "not_started"))),
    exam("2026-07-23"),
    { todayKey: "2026-07-19" }
  );
  assert.equal(plan.daysLeft, 4);
  assert.equal(plan.topicsLeft, 3);
  assert.equal(plan.requiredPerDay, 1); // ceil(3/4)
  assert.equal(plan.pace, "comfortable");
  assert.equal(plan.days.length, 5); // offsets 0..4
  assert.equal(plan.days[4].isExamDay, true);
  assert.ok(plan.days[4].items.some((i) => i.kind === "final"));

  // Every in-scope topic is scheduled exactly once.
  const scheduled = plan.days.flatMap((d) => d.items).filter((i) => i.topicId).map((i) => i.topicId);
  assert.deepEqual([...new Set(scheduled)].sort(), ids);
});

test("auto-schedules a mock ~2 days before the exam", () => {
  const ids = Array.from({ length: 6 }, (_, i) => `t${i}`);
  const plan = buildExamPlan(
    courseWith(ids),
    statsWith(ids.map((id) => topicRef(id, "not_started"))),
    exam("2026-07-26"), // 7 days out
    { todayKey: "2026-07-19" }
  );
  const mockDay = plan.days.find((d) => d.items.some((i) => i.kind === "mock"));
  assert.ok(mockDay, "a day should carry a mock");
  assert.equal(mockDay!.offset, plan.daysLeft - 2);
});

test("flags 'behind' and caps per-day when the deadline is tight", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const plan = buildExamPlan(
    courseWith(ids),
    statsWith(ids.map((id) => topicRef(id, "not_started"))),
    exam("2026-07-21"), // 2 days out, 40 topics
    { todayKey: "2026-07-19", intensity: "steady" }
  );
  assert.equal(plan.pace, "behind");
  assert.ok(plan.perDay <= 6, "steady intensity caps per-day at 6");
  // Nothing is dropped: the last study day crams whatever's left.
  const scheduled = new Set(plan.days.flatMap((d) => d.items).filter((i) => i.topicId).map((i) => i.topicId));
  assert.equal(scheduled.size, 40);
});

test("intensity raises the per-day cap", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `t${i}`);
  // 40 topics in 3 days → required ≈ 14/day, above every cap, so the cap bites.
  const mk = (intensity: "relaxed" | "steady" | "intense") =>
    buildExamPlan(
      courseWith(ids),
      statsWith(ids.map((id) => topicRef(id, "not_started"))),
      exam("2026-07-22"),
      { todayKey: "2026-07-19", intensity }
    ).perDay;
  assert.equal(mk("relaxed"), 4);
  assert.equal(mk("steady"), 6);
  assert.equal(mk("intense"), 10);
});
