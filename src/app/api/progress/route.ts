import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, updateProgress } from "@/lib/store/repositories";
import { locateTopic } from "@/lib/teach/context";
import type { CourseProgress, TopicStatus } from "@/lib/types";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  status: z
    .enum(["not_started", "learning", "completed", "weak", "mastered"])
    .optional(),
  bookmarked: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());

  const course = await getCourse(body.courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  if (!locateTopic(course, body.topicId)) return fail("Topic not found.", 404);

  const fallback: CourseProgress = {
    courseId: body.courseId,
    userId: user.id,
    topics: {},
    updatedAt: new Date().toISOString(),
    mockAttempts: [],
  };

  const progress = await updateProgress(body.courseId, fallback, (p) => {
    const entry = p.topics[body.topicId] ?? {
      topicId: body.topicId,
      status: "not_started" as TopicStatus,
      bookmarked: false,
      notes: "",
      scores: [],
    };
    if (body.status !== undefined) entry.status = body.status;
    if (body.bookmarked !== undefined) entry.bookmarked = body.bookmarked;
    if (body.notes !== undefined) entry.notes = body.notes;
    p.topics[body.topicId] = entry;
    p.updatedAt = new Date().toISOString();
    return p;
  });

  return ok({ progress: progress.topics[body.topicId] });
});
