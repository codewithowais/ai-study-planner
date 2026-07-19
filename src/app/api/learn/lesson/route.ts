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
  const { courseId, topicId, regenerate, depth, prefetch } = schema.parse(
    await req.json(),
  );

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id)
    return fail("Course not found.", 404);

  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  const variant = depth ?? "default";
  const fingerprintInput = {
    feature: "lesson",
    promptVersion: LESSON_PROMPT_VERSION,
    provider: user.settings.provider,
    // Match generate()'s effective model resolution so an env-set model still
    // invalidates the cache (settings.model → AI_MODEL → default).
    model: user.settings.model ?? process.env.AI_MODEL ?? "default",
    level: user.onboarding.level,
    depth: variant,
    courseTitle: course.title,
    chapterTitle: loc.chapterTitle,
    topic: loc.topic,
    // NB: intentionally NOT course.resourceIds — that course-global list would
    // re-bill EVERY topic's lesson when any new resource is added. loc.topic
    // carries topic.sources, and gatherSourceText reads only the topic's own
    // pages, so the topic alone determines the grounding text.
  };
  // Pages cited by OTHER topics too: numbered exercises there belong to the
  // neighbouring lessons, so they must not be hard-required from this one.
  const otherTopicPages = new Set<number>();
  for (const s of course.subjects)
    for (const ch of s.chapters)
      for (const t of ch.topics) {
        if (t.id === loc.topic.id) continue;
        for (const src of t.sources) otherTopicPages.add(src.page);
      }
  const exclusivePages = loc.topic.sources
    .map((s) => s.page)
    .filter((p) => !otherTopicPages.has(p));

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
        exclusivePages,
        // Must match the fingerprint's depth or the variant cache would be
        // poisoned with default-depth content.
        depth,
      },
      { provider: user.settings.provider, model: user.settings.model },
    );
  };

  // Prefetch: if already cached, do nothing; otherwise generate + cache only.
  if (prefetch) {
    await getOrGenerateCached<Lesson>({
      fingerprintInput,
      read: () => getLesson<unknown>(courseId, topicId, variant),
      save: (cache) => saveLesson(courseId, topicId, cache, variant),
      generate: generateFreshLesson,
      // Old pre-envelope lessons predate the easy-tone + exercise-coverage
      // rules — regenerate them to the current standard on next access.
      acceptLegacy: false,
    });
    return ok({ prefetched: true });
  }

  const lesson = await getOrGenerateCached<Lesson>({
    fingerprintInput,
    read: () =>
      regenerate ? null : getLesson<unknown>(courseId, topicId, variant),
    save: (cache) => saveLesson(courseId, topicId, cache, variant),
    generate: generateFreshLesson,
    acceptLegacy: false,
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
    topic: {
      id: loc.topic.id,
      title: loc.topic.title,
      subtopics: loc.topic.subtopics,
      sources: loc.topic.sources,
    },
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
