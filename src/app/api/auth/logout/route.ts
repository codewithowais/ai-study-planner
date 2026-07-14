import { endSession } from "@/lib/auth";
import { handle, ok } from "@/lib/api";

export const POST = handle(async () => {
  await endSession();
  return ok({ ok: true });
});
