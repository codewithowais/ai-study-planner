import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { companionHealthy } from "@/lib/ai/provider";

export const GET = handle(async () => {
  await requireUser();
  const healthy = await companionHealthy();
  return ok({
    healthy,
    provider: process.env.AI_PROVIDER || "claude",
  });
});
