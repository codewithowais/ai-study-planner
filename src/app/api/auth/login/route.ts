import { z } from "zod";
import { startSession, verifyPassword } from "@/lib/auth";
import { findUserByEmail } from "@/lib/store/repositories";
import { fail, handle, ok } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const POST = handle(async (req: Request) => {
  const { email, password } = schema.parse(await req.json());
  const user = await findUserByEmail(email);
  // Same message whether the email or password is wrong (no user enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("Incorrect email or password.", 401);
  }
  await startSession(user.id);
  return ok({
    user: { id: user.id, name: user.name, email: user.email },
    onboardingCompleted: user.onboarding.completed,
  });
});
