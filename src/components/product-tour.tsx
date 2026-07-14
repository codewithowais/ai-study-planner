"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload,
  GraduationCap,
  ClipboardList,
  RotateCcw,
  Target,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KEY = "asp_tour_v1";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to AI Study Partner 👋",
    body: "Turn your own notes into a guided course — learn every topic step by step, test yourself, and walk into your exam ready. Here's the 60-second tour.",
  },
  {
    icon: Upload,
    title: "1. Upload your material",
    body: "Add a PDF, notes or past papers. The AI reads everything and builds a structured course — subjects, modules and topics — with nothing skipped.",
  },
  {
    icon: GraduationCap,
    title: "2. Learn each topic",
    body: "Every topic is taught from the ground up with examples and exam tips, grounded in YOUR material. Stuck? Ask the tutor chat, hit “Simpler”, make flashcards, or tap a source to verify it.",
  },
  {
    icon: ClipboardList,
    title: "3. Test yourself",
    body: "Take a quiz after a topic — it's scored and explains every mistake. “Redo wrong” retries just what you missed, and mock exams cover the whole course.",
  },
  {
    icon: RotateCcw,
    title: "4. Never forget it",
    body: "Weak topics show up in Revision, and everything you learn comes back for spaced-repetition review at the right time — so it sticks until exam day.",
  },
  {
    icon: Target,
    title: "5. Always know what's next",
    body: "Your dashboard's “Today's Focus” tells you the single best thing to study right now. Organize courses by term and archive them when they end.",
  },
];

export function ProductTour({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  // Auto-open once, on first dashboard visit.
  useEffect(() => {
    if (pathname !== "/dashboard") return;
    try {
      if (!localStorage.getItem(KEY)) {
        setI(0);
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  // Allow re-opening from anywhere (the sidebar "Tour" button dispatches this).
  useEffect(() => {
    const onOpen = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener("open-product-tour", onOpen);
    return () => window.removeEventListener("open-product-tour", onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Close this overview and launch the interactive, element-by-element walkthrough.
  const startGuided = useCallback(() => {
    close();
    // Let the overlay unmount before the spotlight measures elements.
    setTimeout(() => window.dispatchEvent(new Event("start-guided-tour")), 60);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl animate-fade-in">
        {/* Gradient header */}
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-primary to-violet-600 px-6 py-8 text-center text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Icon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">{step.title}</h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-center text-sm leading-relaxed text-muted-foreground">{step.body}</p>

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`Step ${n + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  n === i ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                )}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Skip
            </Button>
            <div className="flex gap-2">
              {i > 0 && (
                <Button variant="outline" size="sm" onClick={() => setI((n) => n - 1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {last ? (
                <Button size="sm" onClick={close}>
                  Start studying
                </Button>
              ) : (
                <Button size="sm" onClick={() => setI((n) => n + 1)}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Interactive option: walk me through the real screen step by step */}
          <button
            onClick={startGuided}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            Show me around — guide me step by step
          </button>
        </div>
      </div>
    </div>
  );
}
