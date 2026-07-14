import { z } from "zod";
import { accountExists, registerUser, startSession } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters").max(200),
});

export const POST = handle(async (req: Request) => {
  // Single-user app: block a second registration.
  if (await accountExists()) {
    return fail("An account already exists on this device. Please sign in.", 409);
  }
  const body = schema.parse(await req.json());
  const user = await registerUser(body);
  await startSession(user.id);
  return ok({
    user: { id: user.id, name: user.name, email: user.email },
    onboardingCompleted: false,
  });
});
