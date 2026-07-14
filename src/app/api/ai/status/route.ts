import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { companionStatus } from "@/lib/ai/companion";

export const GET = handle(async () => {
  const user = await requireUser();
  const status = await companionStatus();
  return ok({ ...status, activeProvider: user.settings.provider });
});
