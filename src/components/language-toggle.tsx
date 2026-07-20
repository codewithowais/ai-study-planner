"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentLanguage } from "@/lib/use-lesson-language";

/**
 * Compact English ⇄ Roman Urdu switch. The label shows the language you'd
 * switch TO, matching the lesson page's More-menu toggle.
 */
export function LanguageToggle({
  value,
  onChange,
  disabled,
}: {
  value: ContentLanguage;
  onChange: (language: ContentLanguage) => void;
  disabled?: boolean;
}) {
  const next: ContentLanguage = value === "roman-ur" ? "en" : "roman-ur";
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onChange(next)}
      title={value === "roman-ur" ? "Switch to English" : "Roman Urdu mein dikhayein"}
    >
      <Languages className="h-4 w-4" />
      {value === "roman-ur" ? "English" : "Roman Urdu"}
    </Button>
  );
}
