"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Menu, X, AlertTriangle, ArrowRight, HelpCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";
import { ProductTour } from "@/components/product-tour";
import { GuidedTour } from "@/components/guided-tour";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopicSearch } from "@/components/topic-search";
import { APP_TOUR } from "@/lib/tours";

function openSearch() {
  window.dispatchEvent(new Event("open-search"));
}

function startTour() {
  window.dispatchEvent(new Event("open-product-tour"));
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [aiIssue, setAiIssue] = useState<null | "companion" | "cli">(null);

  useEffect(() => {
    // Cheap check (no auth probe): is the companion up and the active CLI installed?
    let active = true;
    fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!active || !s) return;
        if (!s.reachable) setAiIssue("companion");
        else if (!s.providers?.[s.activeProvider]?.installed) setAiIssue("cli");
        else setAiIssue(null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  async function logout() {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout");
      router.replace("/login");
    } catch {
      toast({ title: "Could not sign out", variant: "destructive" });
      setLoggingOut(false);
    }
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const NavLinks = () => (
    <nav data-tour="nav" className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const SidebarInner = () => (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
        <BookOpen className="h-6 w-6 text-primary" />
        <span className="font-semibold">AI Study Partner</span>
      </Link>
      <button
        onClick={() => {
          setMobileOpen(false);
          openSearch();
        }}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search topics…</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>
      <NavLinks />
      <div className="border-t border-border pt-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials || "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => {
            setMobileOpen(false);
            startTour();
          }}
        >
          <HelpCircle className="h-4 w-4" />
          Take a tour
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={logout}
          disabled={loggingOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <ProductTour pathname={pathname} />
      <GuidedTour steps={APP_TOUR} eventName="start-guided-tour" />
      <TopicSearch />
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarInner />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-background shadow-xl">
            <SidebarInner />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-semibold">Study Partner</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={openSearch} aria-label="Search topics">
              <Search className="h-5 w-5" />
            </Button>
            <ThemeToggle compact />
            <Button
              data-tour="menu"
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {aiIssue && !pathname.startsWith("/settings") && (
          <Link href="/settings" className="block border-b border-warning/40 bg-warning/10 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                {aiIssue === "companion"
                  ? "Local AI companion isn’t running — lessons & quizzes can’t generate."
                  : "The AI CLI isn’t installed or connected yet."}
              </p>
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                Fix in settings <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        )}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
