"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  Loader2,
  AlertTriangle,
  X,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GuidedTour } from "@/components/guided-tour";
import { UPLOAD_TOUR } from "@/lib/tours";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

const ACCEPT = ".pdf,.txt,.md,.markdown";
const MAX_MB = 25;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [companion, setCompanion] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    api
      .get<{ healthy: boolean }>("/api/ai/health")
      .then((h) => setCompanion(h.healthy ? "up" : "down"))
      .catch(() => setCompanion("down"));
  }, []);

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    const okType = /\.(pdf|txt|md|markdown)$/i.test(f.name);
    if (!okType) {
      setError("Unsupported file type. Upload a PDF, .txt or .md file.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
  }

  function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setPct(0);

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const { courseId } = JSON.parse(xhr.responseText);
        toast({
          title: "Uploaded",
          description: "Building your course outline…",
        });
        router.push(`/courses/${courseId}`);
      } else {
        let msg = "Upload failed.";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {
          /* keep default */
        }
        setError(msg);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Network error during upload.");
    };
    xhr.send(form);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <GuidedTour steps={UPLOAD_TOUR} eventName="start-upload-tour" autoKey="asp_tour_upload_v1" />
      <PageHeader
        title="Upload study material"
        description="Upload a PDF, notes or past papers. We'll read it, organize every topic, and build a course you can learn step-by-step."
        actions={
          <Button
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("start-upload-tour"))}
          >
            <HelpCircle className="h-4 w-4" />
            Show me how
          </Button>
        }
      />

      {companion === "down" && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Local AI companion isn&apos;t running.</p>
            <p className="text-muted-foreground">
              Upload still works, but the course outline can&apos;t be generated
              until you start it. Run{" "}
              <code className="rounded bg-secondary px-1 py-0.5">npm run companion</code>{" "}
              in your project.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              data-tour="dropzone"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition",
                dragging
                  ? "border-primary bg-accent"
                  : "border-border hover:border-primary/60 hover:bg-secondary/60"
              )}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <UploadCloud className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="font-medium">
                Drag &amp; drop your file here, or click to browse
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                PDF, TXT or Markdown · up to {MAX_MB} MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-5" data-tour="uploaded-file">
              <div className="flex items-center gap-3 rounded-lg border border-border p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <FileText className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setFile(null);
                      setPct(0);
                    }}
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {pct < 100 ? `Uploading… ${pct}%` : "Processing file…"}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button data-tour="generate" onClick={upload} disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Generate course
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
