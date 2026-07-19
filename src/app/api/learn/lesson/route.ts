import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  getCourse,
  getLesson,
  recordStudyDay,
  saveLesson,
  updateProgress,
} from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import {
  generateLesson,
  LESSON_PROMPT_VERSION,
  type Lesson,
} from "@/lib/teach/lesson";
import { getOrGenerateCached } from "@/lib/ai/cache-key";
import { localDateKey } from "@/lib/streak";
import type { CourseProgress } from "@/lib/types";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  regenerate: z.boolean().optional(),
  depth: z.enum(["simpler", "deeper"]).optional(),
  /** Warm the cache for an upcoming topic without touching progress/resume. */
  prefetch: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 240;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, regenerate, depth, prefetch } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);

  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  const variant = depth ?? "default";
  const fingerprintInput = {
    feature: "lesson",
    promptVersion: LESSON_PROMPT_VERSION,
    provider: user.settings.provider,
    model: user.settings.model ?? "default",
    level: user.onboarding.level,
    depth: variant,
    courseTitle: course.title,
    chapterTitle: loc.chapterTitle,
    topic: loc.topic,
    // Resources are immutable once extracted: uploads only ever append new
    // resource ids to course.resourceIds and pages are never mutated, so the
    // id list stands in for the full source text. A future "replace PDF"
    // feature must mint new resource ids or cached content would go stale.
    resourceIds: course.resourceIds,
  };
  // Source text is only gathered on a cache miss — cache hits do zero
  // resource I/O.
  const generateFreshLesson = async () => {
    const sources = await gatherSourceText(course, loc.topic);
    return generateLesson(
      {
        topic: loc.topic,
        chapterTitle: loc.chapterTitle,
        courseTitle: course.title,
        level: user.onboarding.level,
        sources,
        // Must match the fingerprint's depth or the variant cache would be
        // poisoned with default-depth content.
        depth,
      },
      { provider: user.settings.provider, model: user.settings.model }
    );
  };

  // Prefetch: if already cached, do nothing; otherwise generate + cache only.
  if (prefetch) {
    await getOrGenerateCached<Lesson>({
      fingerprintInput,
      read: () => getLesson<unknown>(courseId, topicId, variant),
      save: (cache) => saveLesson(courseId, topicId, cache, variant),
      generate: generateFreshLesson,
    });
    return ok({ prefetched: true });
  }

  const lesson = await getOrGenerateCached<Lesson>({
    fingerprintInput,
    read: () =>
      regenerate ? null : getLesson<unknown>(courseId, topicId, variant),
    save: (cache) => saveLesson(courseId, topicId, cache, variant),
    generate: generateFreshLesson,
  });

  // Studying a topic counts toward today's streak.
  await recordStudyDay(user.id, localDateKey());

  // Mark as learning + remember position for resume.
  const fallback: CourseProgress = {
    courseId,
    userId: user.id,
    topics: {},
    updatedAt: new Date().toISOString(),
    mockAttempts: [],
  };
  const progress = await updateProgress(courseId, fallback, (p) => {
    const entry = p.topics[topicId] ?? {
      topicId,
      status: "not_started" as const,
      bookmarked: false,
      notes: "",
      scores: [],
    };
    if (entry.status === "not_started") entry.status = "learning";
    entry.lastVisited = new Date().toISOString();
    entry.lessonCached = true;
    p.topics[topicId] = entry;
    p.lastTopicId = topicId;
    p.updatedAt = new Date().toISOString();
    return p;
  });

  const prevId = loc.index > 0 ? loc.order[loc.index - 1] : null;
  const nextId =
    loc.index < loc.order.length - 1 ? loc.order[loc.index + 1] : null;

  return ok({
    lesson,
    topic: { id: loc.topic.id, title: loc.topic.title, subtopics: loc.topic.subtopics, sources: loc.topic.sources },
    nav: {
      chapterTitle: loc.chapterTitle,
      subjectTitle: loc.subjectTitle,
      index: loc.index,
      total: loc.order.length,
      prevId,
      nextId,
    },
    progress: progress.topics[topicId],
  });
});
