"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. The initial class is set by an inline script in the root
 * layout (no flash); this just flips it and remembers the choice.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  if (compact) {
    return (
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
        {mounted && dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start text-muted-foreground"
      onClick={toggle}
    >
      {mounted && dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {mounted && dark ? "Light mode" : "Dark mode"}
    </Button>
  );
}
