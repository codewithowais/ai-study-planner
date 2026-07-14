import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getSummary, saveSummary } from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import { generateSummary, type Summary } from "@/lib/teach/summary";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  regenerate: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 150;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, regenerate } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  let summary = regenerate ? null : await getSummary<Summary>(courseId, topicId);
  if (!summary) {
    const sources = await gatherSourceText(course, loc.topic);
    summary = await generateSummary(
      { topic: loc.topic, chapterTitle: loc.chapterTitle, sources },
      { provider: user.settings.provider, model: user.settings.model }
    );
    await saveSummary(courseId, topicId, summary);
  }

  return ok({ summary });
});
