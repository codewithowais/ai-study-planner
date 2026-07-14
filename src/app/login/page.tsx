"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, GraduationCap, Target, FileText, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuidedTour } from "@/components/guided-tour";
import { LOGIN_TOUR } from "@/lib/tours";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

type Mode = "signin" | "register";
type Status = {
  accountExists: boolean;
  authenticated: boolean;
  onboardingCompleted: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Status>("/api/auth/status")
      .then((s) => {
        if (!active) return;
        if (s.authenticated) {
          router.replace(s.onboardingCompleted ? "/dashboard" : "/onboarding");
          return;
        }
        setMode(s.accountExists ? "signin" : "register");
        setLoadingStatus(false);
      })
      .catch(() => active && setLoadingStatus(false));
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        const res = await api.post<{ onboardingCompleted: boolean }>(
          "/api/auth/register",
          { name, email, password }
        );
        toast({ title: "Account created", description: "Let's set up your study profile." });
        router.replace(res.onboardingCompleted ? "/dashboard" : "/onboarding");
      } else {
        const res = await api.post<{ onboardingCompleted: boolean }>(
          "/api/auth/login",
          { email, password }
        );
        toast({ title: "Welcome back" });
        router.replace(res.onboardingCompleted ? "/dashboard" : "/onboarding");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <GuidedTour
        steps={LOGIN_TOUR}
        eventName="start-setup-tour"
        autoKey={mode === "register" ? "asp_tour_login_v1" : undefined}
      />
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-6 w-6" />
          AI Study Partner
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-bold leading-tight">
            Turn your notes into a guided course.
          </h2>
          <ul className="space-y-4 text-primary-foreground/90">
            <li className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Upload PDFs, notes and past papers — we organize every topic.</span>
            </li>
            <li className="flex items-start gap-3">
              <GraduationCap className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Learn step-by-step with explanations grounded in your material.</span>
            </li>
            <li className="flex items-start gap-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Quizzes find your weak topics and track exam readiness.</span>
            </li>
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/70">
          Runs locally with your own AI CLI. Your material stays on your device.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="flex items-center justify-center gap-2 lg:hidden">
              <BookOpen className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">AI Study Partner</span>
            </div>
            <h1 className="text-2xl font-bold">
              {mode === "register" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "register"
                ? "Set up your personal tutor. One account per device."
                : "Sign in to continue learning."}
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("start-setup-tour"))}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              New here? Show me how it works
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  data-tour="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-tour="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" data-tour="auth-submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "register" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "register" ? (
              <>
                Already set up?{" "}
                <button
                  data-tour="auth-toggle"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                First time here?{" "}
                <button
                  data-tour="auth-toggle"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
