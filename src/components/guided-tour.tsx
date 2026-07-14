"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Interactive, anchored walkthrough: spotlights a real element on the page and
 * shows a tooltip beside it, guiding the beginner one step at a time.
 *
 * Reusable across screens — each page passes its own `steps`, a trigger
 * `eventName`, and an optional `autoKey` to auto-open once on first visit.
 */
export interface TourStep {
  selectors: string[]; // try each; use the first that's actually visible
  title: string;
  body: string;
}

function findEl(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (el && el.getBoundingClientRect().width > 0) return el;
  }
  return null;
}

export function GuidedTour({
  steps,
  eventName = "start-guided-tour",
  autoKey,
}: {
  steps: TourStep[];
  eventName?: string;
  autoKey?: string;
}) {
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Resolve the current step to a visible element, skipping missing ones.
  const measure = useCallback(() => {
    let idx = i;
    let el = findEl(steps[idx]?.selectors ?? []);
    while (!el && idx < steps.length - 1) {
      idx++;
      el = findEl(steps[idx].selectors);
    }
    if (idx !== i) setI(idx);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [i, steps]);

  useLayoutEffect(() => {
    if (!active) return;
    measure();
    const t = setTimeout(measure, 350); // after scroll settles
    return () => clearTimeout(t);
  }, [active, i, measure]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, measure]);

  const close = useCallback(() => {
    setActive(false);
    if (autoKey) {
      try {
        localStorage.setItem(autoKey, "1");
      } catch {
        /* ignore */
      }
    }
  }, [autoKey]);

  const start = useCallback(() => {
    setI(0);
    setActive(true);
  }, []);

  // Manual trigger via window event.
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener(eventName, onStart);
    return () => window.removeEventListener(eventName, onStart);
  }, [eventName, start]);

  // Auto-open once on first visit (per autoKey). Delay so the page renders first.
  useEffect(() => {
    if (!autoKey) return;
    let stored = false;
    try {
      stored = !!localStorage.getItem(autoKey);
    } catch {
      /* ignore */
    }
    if (stored) return;
    const t = setTimeout(() => start(), 600);
    return () => clearTimeout(t);
  }, [autoKey, start]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setI((n) => Math.min(steps.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, steps.length]);

  if (!active || steps.length === 0) return null;

  const step = steps[i];
  const last = i === steps.length - 1;

  // Tooltip placement relative to the spotlighted element.
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardW = Math.min(320, vw - 24);
  let top = vh / 2 - 90;
  let left = vw / 2 - cardW / 2;
  if (rect) {
    const below = rect.bottom + 200 < vh;
    top = below ? rect.bottom + 14 : Math.max(12, rect.top - 200);
    left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      {/* click blocker */}
      <div className="absolute inset-0" onClick={() => {}} />

      {/* spotlight cutout */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6)",
          }}
        />
      )}
      {!rect && <div className="absolute inset-0 bg-foreground/60" />}

      {/* tooltip */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-24px)] rounded-2xl bg-background p-4 shadow-2xl animate-fade-in"
        style={{ top, left }}
      >
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Step {i + 1} of {steps.length}
        </div>
        <h3 className="font-semibold">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            {last ? "Done" : "Skip"}
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={() => setI((n) => n - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={close}>
                Finish
              </Button>
            ) : (
              <Button size="sm" onClick={() => setI((n) => n + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
