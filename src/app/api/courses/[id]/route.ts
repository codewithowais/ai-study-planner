import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  deleteCourse,
  getCourse,
  getProgress,
  updateCourse,
} from "@/lib/store/repositories";

const patchSchema = z.object({
  termId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  planTargetDate: z.string().nullable().optional(),
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
    const updated = await updateCourse(course.id, (c) => ({
      ...c,
      termId: body.termId !== undefined ? body.termId : c.termId,
      archived: body.archived !== undefined ? body.archived : c.archived,
      planTargetDate:
        body.planTargetDate !== undefined ? body.planTargetDate : c.planTargetDate,
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
