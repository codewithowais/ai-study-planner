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
import { generateLesson, type Lesson } from "@/lib/teach/lesson";
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

  // Prefetch: if already cached, do nothing; otherwise generate + cache only.
  if (prefetch) {
    const cached = await getLesson<Lesson>(courseId, topicId);
    if (!cached) {
      const sources = await gatherSourceText(course, loc.topic);
      const lesson = await generateLesson(
        {
          topic: loc.topic,
          chapterTitle: loc.chapterTitle,
          courseTitle: course.title,
          level: user.onboarding.level,
          sources,
        },
        { provider: user.settings.provider, model: user.settings.model }
      );
      await saveLesson(courseId, topicId, lesson);
    }
    return ok({ prefetched: true });
  }

  // A depth change always re-teaches at that depth and re-caches.
  let lesson = regenerate || depth ? null : await getLesson<Lesson>(courseId, topicId);
  if (!lesson) {
    const sources = await gatherSourceText(course, loc.topic);
    lesson = await generateLesson(
      {
        topic: loc.topic,
        chapterTitle: loc.chapterTitle,
        courseTitle: course.title,
        level: user.onboarding.level,
        sources,
        depth,
      },
      { provider: user.settings.provider, model: user.settings.model }
    );
    await saveLesson(courseId, topicId, lesson);
  }

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
