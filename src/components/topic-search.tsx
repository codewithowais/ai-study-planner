"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

interface Row {
  courseId: string;
  courseTitle: string;
  topicId: string;
  title: string;
  chapterTitle: string;
}

/**
 * Command-palette search over every topic. Opens with ⌘K / Ctrl-K or the
 * `open-search` window event; arrow keys + Enter to jump straight to a lesson.
 */
export function TopicSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      if (rows === null) {
        api.get<{ topics: Row[] }>("/api/search").then((r) => setRows(r.topics)).catch(() => setRows([]));
      }
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    } else {
      setQ("");
      setActive(0);
    }
  }, [open, rows]);

  const results = useMemo(() => {
    const list = rows ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list.slice(0, 40);
    return list
      .filter((r) => `${r.title} ${r.chapterTitle} ${r.courseTitle}`.toLowerCase().includes(term))
      .slice(0, 50);
  }, [rows, q]);

  useEffect(() => setActive(0), [q]);

  function go(r: Row) {
    setOpen(false);
    router.push(`/learn/${r.courseId}/${r.topicId}`);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-fade-in">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Search all topics…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {rows === null ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading topics…
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No topics match “{q}”.
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.courseId}_${r.topicId}`}
                onClick={() => go(r)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition",
                  i === active ? "bg-accent" : "hover:bg-secondary"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.chapterTitle} · {r.courseTitle}
                  </p>
                </div>
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
