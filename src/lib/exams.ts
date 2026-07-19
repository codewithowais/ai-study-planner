// Exam-first helpers: an exam is a name + date + covered chapters, and
// everything else (pacing, mock scope, readiness) derives from it here.
import type { Course, CourseExam, Topic } from "@/lib/types";
import { daysLeftUntil } from "@/lib/plan-dates";

/** All chapters of a course in reading order (id + title + topics). */
export function courseChapters(
  course: Course
): { id: string; title: string; topics: Topic[] }[] {
  return course.subjects.flatMap((s) =>
    s.chapters.map((c) => ({ id: c.id, title: c.title, topics: c.topics }))
  );
}

/** Topic ids covered by an exam (derived from its chapter ids). */
export function examTopicIds(course: Course, exam: CourseExam): string[] {
  const covered = new Set(exam.chapterIds);
  return courseChapters(course)
    .filter((c) => covered.has(c.id))
    .flatMap((c) => c.topics.map((t) => t.id));
}

/** The next exam that hasn't passed yet (soonest date first). */
export function nearestUpcomingExam(
  exams: CourseExam[] | undefined
): CourseExam | null {
  const upcoming = (exams ?? [])
    .filter((e) => daysLeftUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

/** Short human summary of what an exam covers, e.g. "Module 1 – Module 8". */
export function examCoverageLabel(course: Course, exam: CourseExam): string {
  const covered = new Set(exam.chapterIds);
  const chapters = courseChapters(course).filter((c) => covered.has(c.id));
  if (chapters.length === 0) return "No chapters selected";
  if (chapters.length === 1) return chapters[0].title;
  return `${chapters[0].title} → ${chapters[chapters.length - 1].title}`;
}

/**
 * A scoped copy of the course for mock generation: only the exam's chapters,
 * plus (optionally) a small share of earlier chapters' topics — the way real
 * finals still include some pre-mid content.
 */
export function scopeCourseToExam(course: Course, exam: CourseExam): Course {
  const covered = new Set(exam.chapterIds);
  const all = courseChapters(course);
  const coveredIdx = all
    .map((c, i) => (covered.has(c.id) ? i : -1))
    .filter((i) => i >= 0);
  const firstCovered = coveredIdx.length ? Math.min(...coveredIdx) : 0;

  // Earlier (pre-coverage) chapters, for the optional mixed-in share.
  const share = Math.max(0, Math.min(0.5, exam.includeEarlierShare ?? 0));
  const earlier = all.slice(0, firstCovered).filter((c) => !covered.has(c.id));
  const earlierTopics = earlier.flatMap((c) => c.topics);
  const coveredTopicCount = all
    .filter((c) => covered.has(c.id))
    .reduce((n, c) => n + c.topics.length, 0);
  const earlierQuota = Math.min(
    earlierTopics.length,
    Math.ceil(coveredTopicCount * share)
  );
  // Spread the earlier picks evenly instead of taking only the first pages.
  const picked = new Set<string>();
  if (earlierQuota > 0) {
    const step = earlierTopics.length / earlierQuota;
    for (let i = 0; i < earlierQuota; i++) {
      picked.add(earlierTopics[Math.floor(i * step)].id);
    }
  }

  return {
    ...course,
    subjects: course.subjects
      .map((s) => ({
        ...s,
        chapters: s.chapters
          .map((c) => ({
            ...c,
            topics: covered.has(c.id)
              ? c.topics
              : c.topics.filter((t) => picked.has(t.id)),
          }))
          .filter((c) => c.topics.length > 0),
      }))
      .filter((s) => s.chapters.length > 0),
  };
}
