import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { companionVerify } from "@/lib/ai/companion";

const schema = z.object({ provider: z.enum(["claude", "codex"]) });

export const runtime = "nodejs";
export const maxDuration = 90;

export const POST = handle(async (req: Request) => {
  await requireUser();
  const { provider } = schema.parse(await req.json());
  const result = await companionVerify(provider);
  return ok(result);
});
