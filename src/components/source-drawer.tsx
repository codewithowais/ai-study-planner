"use client";

import { useEffect, useState } from "react";
import { Loader2, X, FileText, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/client";

/**
 * Slide-over that shows the extracted text of a cited source page, so the
 * student can verify the tutor against their own uploaded material.
 */
export function SourceDrawer({
  courseId,
  page,
  onClose,
}: {
  courseId: string;
  page: number | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ page: number; file: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (page === null) return;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .post<{ page: number; file: string; text: string }>("/api/learn/source", { courseId, page })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load source."))
      .finally(() => setLoading(false));
  }, [page, courseId]);

  if (page === null) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="font-semibold">
              Source · page {page}
              {data?.file ? <span className="ml-1 font-normal text-muted-foreground">· {data.file}</span> : null}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {data && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {data.text || "(No extracted text on this page.)"}
            </p>
          )}
        </div>
        <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
          Extracted from your uploaded material — this is what the tutor was grounded in.
        </div>
      </div>
    </div>
  );
}
