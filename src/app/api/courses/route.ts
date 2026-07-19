import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { getTerms, listCoursesWithTerms } from "@/lib/store/repositories";

// ?active=1 → only courses that belong in active views (used by the mock picker).
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const activeOnly = new URL(req.url).searchParams.get("active") === "1";

  const [withTerms, terms] = await Promise.all([
    listCoursesWithTerms(user.id),
    getTerms(user.id),
  ]);

  const rows = activeOnly ? withTerms.filter((x) => x.active) : withTerms;

  return ok({
    terms,
    courses: rows.map(({ course: c, term, active }) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      ready: c.ready,
      error: c.error ?? null,
      topicCount: c.subjects.reduce(
        (n, s) => n + s.chapters.reduce((m, ch) => m + ch.topics.length, 0),
        0
      ),
      createdAt: c.createdAt,
      termId: c.termId ?? null,
      termName: term ? `${term.name} ${term.year}` : null,
      termArchived: term?.archived ?? false,
      archived: !!c.archived,
      active,
      planTargetDate: c.planTargetDate ?? null,
      exams: (c.exams ?? []).map((e) => ({ id: e.id, name: e.name, date: e.date })),
    })),
  });
});
