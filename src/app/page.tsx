import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  // Returning users skip the marketing page and go straight to studying.
  const user = await getCurrentUser();
  if (user) redirect(user.onboarding.completed ? "/dashboard" : "/onboarding");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
        Grounded in your own notes
      </span>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        AI Study Partner
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Upload PDFs, notes, slides and past papers. Get a structured course
        outline, learn every topic step-by-step, take quizzes, and track your
        exam readiness.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Get started
      </Link>
    </main>
  );
}
