import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { updateUser } from "@/lib/store/repositories";
import { handle, ok } from "@/lib/api";

const schema = z.object({
  goal: z.string().trim().min(1, "Tell us your goal").max(300),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  examDate: z.string().optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());
  const updated = await updateUser(user.id, (u) => ({
    ...u,
    onboarding: {
      goal: body.goal,
      level: body.level,
      examDate: body.examDate || undefined,
      completed: true,
    },
  }));
  return ok({ onboarding: updated?.onboarding });
});
