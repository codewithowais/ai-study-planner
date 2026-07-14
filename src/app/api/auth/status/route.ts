import { accountExists, getCurrentUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";

// Tells the login screen whether to show "create account" or "sign in",
// and whether a session is already active.
export const GET = handle(async () => {
  const [exists, user] = await Promise.all([accountExists(), getCurrentUser()]);
  return ok({
    accountExists: exists,
    authenticated: !!user,
    onboardingCompleted: user?.onboarding.completed ?? false,
  });
});
