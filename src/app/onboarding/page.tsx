"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Plug, ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiConnection } from "@/components/ai-connection";
import { GuidedTour } from "@/components/guided-tour";
import { PROFILE_TOUR, CONNECT_TOUR } from "@/lib/tours";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

function ShowMeHow() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("start-setup-tour"))}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      Show me how
    </button>
  );
}

const LEVELS = [
  { value: "beginner", label: "Beginner", hint: "New to this subject" },
  { value: "intermediate", label: "Intermediate", hint: "Know the basics" },
  { value: "advanced", label: "Advanced", hint: "Revising for exams" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [examDate, setExamDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"profile" | "connect">("profile");

  useEffect(() => {
    let active = true;
    api
      .get<{ authenticated: boolean; onboardingCompleted: boolean }>("/api/auth/status")
      .then((s) => {
        if (!active) return;
        if (!s.authenticated) return router.replace("/login");
        if (s.onboardingCompleted) return router.replace("/dashboard");
        setChecking(false);
      })
      .catch(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/onboarding", {
        goal,
        level,
        examDate: examDate || undefined,
      });
      toast({ title: "Profile saved", description: "Now let's connect your AI." });
      setStep("connect");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (step === "connect") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
        <GuidedTour steps={CONNECT_TOUR} eventName="start-setup-tour" autoKey="asp_tour_connect_v1" />
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-xs font-semibold text-success">✓</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
              </div>
              <ShowMeHow />
            </div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Plug className="h-5 w-5 text-primary" />
              Connect your AI
            </CardTitle>
            <CardDescription>
              Your tutor runs on your own local AI. Get it connected here so your first
              course builds smoothly — install the CLI and sign in if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-tour="ai-connection">
              <AiConnection />
            </div>
            <Button data-tour="connect-continue" className="w-full" onClick={() => router.replace("/upload")}>
              Continue to upload
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You can also change this anytime in AI settings.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <GuidedTour steps={PROFILE_TOUR} eventName="start-setup-tour" autoKey="asp_tour_profile_v1" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">2</span>
            </div>
            <ShowMeHow />
          </div>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Set up your study profile
          </CardTitle>
          <CardDescription>
            This helps your tutor pitch explanations at the right level. You can change it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="space-y-2" data-tour="goal">
              <Label htmlFor="goal">What are you studying for?</Label>
              <Input
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Final exam in Financial Management"
                required
              />
            </div>

            <div className="space-y-3" data-tour="level">
              <Label>Your current level</Label>
              <RadioGroup
                value={level}
                onValueChange={(v) => setLevel(v as typeof level)}
                className="grid gap-3 sm:grid-cols-3"
              >
                {LEVELS.map((l) => (
                  <Label
                    key={l.value}
                    htmlFor={`level-${l.value}`}
                    className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-3 transition hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id={`level-${l.value}`} value={l.value} />
                      <span className="font-medium">{l.label}</span>
                    </div>
                    <span className="pl-6 text-xs text-muted-foreground">{l.hint}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2" data-tour="examDate">
              <Label htmlFor="examDate">Exam date (optional)</Label>
              <Input
                id="examDate"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" data-tour="profile-continue" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
