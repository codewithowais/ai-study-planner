import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { updateUser } from "@/lib/store/repositories";

const schema = z.object({
  provider: z.enum(["claude", "codex"]).optional(),
  model: z.string().max(80).optional(),
});

export const GET = handle(async () => {
  const user = await requireUser();
  return ok({
    settings: user.settings,
    defaultProvider: process.env.AI_PROVIDER || "claude",
  });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());
  const updated = await updateUser(user.id, (u) => ({
    ...u,
    settings: {
      provider: body.provider ?? u.settings.provider,
      model:
        body.model !== undefined ? body.model.trim() || undefined : u.settings.model,
    },
  }));
  return ok({ settings: updated?.settings });
});
