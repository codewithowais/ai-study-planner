import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  deleteCourse,
  getCourse,
  getProgress,
  updateCourse,
} from "@/lib/store/repositories";

const examSchema = z.object({
  id: z.string().min(1).max(24),
  name: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chapterIds: z.array(z.string()).min(1).max(200),
  includeEarlierShare: z.number().min(0).max(0.5).optional(),
});

const patchSchema = z.object({
  termId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  planTargetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  exams: z.array(examSchema).max(6).optional(),
});

export const GET = handle(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const user = await requireUser();
    const course = await getCourse(ctx.params.id);
    if (!course || course.userId !== user.id) {
      return fail("Course not found.", 404);
    }
    const progress = await getProgress(course.id);
    return ok({ course, progress });
  }
);

export const PATCH = handle(
  async (req: Request, ctx: { params: { id: string } }) => {
    const user = await requireUser();
    const course = await getCourse(ctx.params.id);
    if (!course || course.userId !== user.id) return fail("Course not found.", 404);
    const body = patchSchema.parse(await req.json());
    // Exams may only cover chapters that actually exist in this course.
    if (body.exams) {
      const known = new Set(
        course.subjects.flatMap((s) => s.chapters.map((ch) => ch.id))
      );
      for (const exam of body.exams) {
        if (exam.chapterIds.some((id) => !known.has(id))) {
          return fail("Exam covers unknown chapters.", 400);
        }
      }
    }
    const updated = await updateCourse(course.id, (c) => ({
      ...c,
      termId: body.termId !== undefined ? body.termId : c.termId,
      archived: body.archived !== undefined ? body.archived : c.archived,
      planTargetDate:
        body.planTargetDate !== undefined ? body.planTargetDate : c.planTargetDate,
      exams: body.exams !== undefined ? body.exams : c.exams,
    }));
    return ok({ course: updated });
  }
);

export const DELETE = handle(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const user = await requireUser();
    const course = await getCourse(ctx.params.id);
    if (!course || course.userId !== user.id) {
      return fail("Course not found.", 404);
    }
    await deleteCourse(course.id);
    return ok({ ok: true });
  }
);
