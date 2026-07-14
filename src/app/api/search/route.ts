import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { listActiveCourses } from "@/lib/store/repositories";

/** Flat list of every topic in the user's active courses, for quick search. */
export const GET = handle(async () => {
  const user = await requireUser();
  const courses = await listActiveCourses(user.id);

  const topics: {
    courseId: string;
    courseTitle: string;
    topicId: string;
    title: string;
    chapterTitle: string;
  }[] = [];

  for (const c of courses) {
    if (!c.ready || c.error) continue;
    for (const s of c.subjects)
      for (const ch of s.chapters)
        for (const t of ch.topics)
          topics.push({
            courseId: c.id,
            courseTitle: c.title,
            topicId: t.id,
            title: t.title,
            chapterTitle: ch.title,
          });
  }

  return ok({ topics });
});
