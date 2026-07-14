"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

/**
 * Friendly loading state for slow AI generations (10–40s). Rotates through
 * honest step messages and shows an elapsed timer + realistic estimate, so
 * the wait never feels like the app hung.
 */
export function Generating({
  icon: Icon,
  title,
  steps,
  estimate = "usually 20–40 seconds",
}: {
  icon: LucideIcon;
  title: string;
  steps: string[];
  estimate?: string;
}) {
  const [step, setStep] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => (s + 1 < steps.length ? s + 1 : s)),
      6000
    );
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>

      <ul className="mt-5 space-y-2 text-left text-sm">
        {steps.map((s, i) => (
          <li
            key={s}
            className={`flex items-center gap-2 transition-colors ${
              i < step
                ? "text-muted-foreground"
                : i === step
                  ? "font-medium text-foreground"
                  : "text-muted-foreground/40"
            }`}
          >
            {i < step ? (
              <span className="text-success">✓</span>
            ) : i === step ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            {s}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-muted-foreground">
        {estimate} · {secs}s elapsed
      </p>
    </div>
  );
}
