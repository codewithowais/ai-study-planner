import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { deleteTerm, updateTerm } from "@/lib/store/repositories";

const schema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = handle(
  async (req: Request, ctx: { params: { id: string } }) => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const updated = await updateTerm(ctx.params.id, user.id, (t) => ({
      ...t,
      name: body.name ?? t.name,
      year: body.year ?? t.year,
      archived: body.archived ?? t.archived,
    }));
    if (!updated) return fail("Term not found.", 404);
    return ok({ term: updated });
  }
);

export const DELETE = handle(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const user = await requireUser();
    await deleteTerm(ctx.params.id, user.id);
    return ok({ ok: true });
  }
);
