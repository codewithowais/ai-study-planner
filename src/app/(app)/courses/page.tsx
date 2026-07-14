"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Upload,
  Loader2,
  Plus,
  MoreVertical,
  FolderInput,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  CalendarDays,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";
import { CourseCover } from "@/components/course-cover";
import { CoursePlanButton } from "@/components/course-plan-button";
import type { Term } from "@/lib/types";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  ready: boolean;
  error: string | null;
  topicCount: number;
  termId: string | null;
  termName: string | null;
  archived: boolean;
  active: boolean;
  planTargetDate: string | null;
}

export default function CoursesPage() {
  const { toast } = useToast();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [termDialog, setTermDialog] = useState<
    { mode: "create" | "edit"; id?: string; name: string; year: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ terms: Term[]; courses: CourseSummary[] }>("/api/courses");
      setCourses(r.courses);
      setTerms(r.terms);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTerm() {
    if (!termDialog) return;
    const year = parseInt(termDialog.year, 10);
    if (!termDialog.name.trim() || Number.isNaN(year)) {
      toast({ title: "Enter a term name and year", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (termDialog.mode === "create") {
        await api.post("/api/terms", { name: termDialog.name.trim(), year });
        toast({ title: "Term created" });
      } else {
        await api.patch(`/api/terms/${termDialog.id}`, { name: termDialog.name.trim(), year });
        toast({ title: "Term updated" });
      }
      setTermDialog(null);
      await load();
    } catch (e) {
      toast({ title: "Could not save term", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  /** Run an action, refresh, and surface success/failure — never fail silently. */
  async function run(action: () => Promise<unknown>, successMsg: string) {
    try {
      await action();
      await load();
      toast({ title: successMsg });
    } catch (e) {
      toast({
        title: "That didn't work",
        description:
          e instanceof ApiError ? e.message : "Could not reach the server. Please try again.",
        variant: "destructive",
      });
    }
  }

  const setTermArchived = (id: string, archived: boolean) =>
    run(() => api.patch(`/api/terms/${id}`, { archived }), archived ? "Term archived" : "Term restored");

  const removeTerm = (id: string) => {
    if (!confirm("Delete this term? Its courses stay but become unassigned.")) return;
    return run(() => api.del(`/api/terms/${id}`), "Term deleted");
  };

  const moveCourse = (courseId: string, termId: string | null) =>
    run(() => api.patch(`/api/courses/${courseId}`, { termId }), "Course moved");

  const setCourseArchived = (courseId: string, archived: boolean) =>
    run(() => api.patch(`/api/courses/${courseId}`, { archived }), archived ? "Course archived" : "Course restored");

  const removeCourse = (courseId: string) => {
    if (!confirm("Delete this course and its progress? This cannot be undone.")) return;
    return run(() => api.del(`/api/courses/${courseId}`), "Course deleted");
  };

  const activeTerms = terms.filter((t) => !t.archived);
  const archivedTerms = terms.filter((t) => t.archived);
  const all = courses ?? [];

  const activeInTerm = (termId: string) =>
    all.filter((c) => c.termId === termId && !c.archived);
  const unassigned = all.filter((c) => !c.termId && !c.archived);
  const archived = all.filter((c) => !c.active); // archived course OR in archived term

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="My courses"
        description="Organize courses by term and year. Archive a term when it ends — it stays here but leaves your active views."
        actions={
          <>
            <Button variant="outline" onClick={() => setTermDialog({ mode: "create", name: "", year: "2026" })}>
              <Plus className="h-4 w-4" />
              New term
            </Button>
            <Button asChild>
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload material
              </Link>
            </Button>
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {!courses && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      )}

      {courses && all.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Upload a PDF or notes and we'll build a structured course."
          action={
            <Button asChild>
              <Link href="/upload"><Upload className="h-4 w-4" />Upload your first resource</Link>
            </Button>
          }
        />
      )}

      {courses && all.length > 0 && (
        <div className="space-y-8">
          {/* Active term sections */}
          {activeTerms.map((t) => (
            <TermSection
              key={t.id}
              title={`${t.name} ${t.year}`}
              count={activeInTerm(t.id).length}
              onEdit={() => setTermDialog({ mode: "edit", id: t.id, name: t.name, year: String(t.year) })}
              onArchive={() => setTermArchived(t.id, true)}
              onDelete={() => removeTerm(t.id)}
            >
              {activeInTerm(t.id).length === 0 ? (
                <EmptyRow />
              ) : (
                <CourseGrid
                  courses={activeInTerm(t.id)}
                  terms={activeTerms}
                  onMove={moveCourse}
                  onArchive={setCourseArchived}
                  onDelete={removeCourse}
                />
              )}
            </TermSection>
          ))}

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <TermSection title="No term" count={unassigned.length} muted>
              <CourseGrid
                courses={unassigned}
                terms={activeTerms}
                onMove={moveCourse}
                onArchive={setCourseArchived}
                onDelete={removeCourse}
              />
            </TermSection>
          )}

          {/* Archived */}
          {archived.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Archive className="h-4 w-4" />
                Archived ({archived.length}) {showArchived ? "▲" : "▼"}
              </button>
              {showArchived && (
                <>
                  {archivedTerms.map((t) => (
                    <div key={t.id} className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-muted-foreground">
                          {t.name} {t.year} · archived
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => setTermArchived(t.id, false)}>
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore term
                        </Button>
                      </div>
                      <CourseGrid
                        courses={all.filter((c) => c.termId === t.id)}
                        terms={activeTerms}
                        onMove={moveCourse}
                        onArchive={setCourseArchived}
                        onDelete={removeCourse}
                        archivedView
                      />
                    </div>
                  ))}
                  <CourseGrid
                    courses={archived.filter((c) => c.archived && !archivedTerms.some((t) => t.id === c.termId))}
                    terms={activeTerms}
                    onMove={moveCourse}
                    onArchive={setCourseArchived}
                    onDelete={removeCourse}
                    archivedView
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Term create/edit dialog */}
      <Dialog open={!!termDialog} onOpenChange={(o) => !o && setTermDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{termDialog?.mode === "create" ? "New term" : "Edit term"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="term-name">Term name</Label>
              <Input
                id="term-name"
                placeholder="e.g. Fall, Spring, Semester 1"
                value={termDialog?.name ?? ""}
                onChange={(e) => setTermDialog((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-year">Year</Label>
              <Input
                id="term-year"
                type="number"
                value={termDialog?.year ?? ""}
                onChange={(e) => setTermDialog((d) => (d ? { ...d, year: e.target.value } : d))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermDialog(null)}>Cancel</Button>
            <Button onClick={saveTerm} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {termDialog?.mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TermSection({
  title,
  count,
  muted,
  onEdit,
  onArchive,
  onDelete,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {muted ? (
            <Layers className="h-4 w-4 text-muted-foreground" />
          ) : (
            <CalendarDays className="h-4 w-4 text-primary" />
          )}
          {title}
          <Badge variant="secondary" className="ml-1">{count}</Badge>
        </h2>
        {onEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Term options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" />Edit term</DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive}><Archive className="h-4 w-4" />Archive term</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />Delete term
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow() {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      No courses in this term yet. Move a course here from its ⋯ menu, or upload new material.
    </p>
  );
}

function CourseGrid({
  courses,
  terms,
  onMove,
  onArchive,
  onDelete,
  archivedView,
}: {
  courses: CourseSummary[];
  terms: Term[];
  onMove: (courseId: string, termId: string | null) => void;
  onArchive: (courseId: string, archived: boolean) => void;
  onDelete: (courseId: string) => void;
  archivedView?: boolean;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Card
          key={c.id}
          className="group flex flex-col overflow-hidden border-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-xl"
        >
          <CourseCover
            id={c.id}
            title={c.title}
            topRight={
              <>
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  {!c.ready ? "Building…" : c.error ? "Error" : "Ready"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                      aria-label="Course options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger><FolderInput className="h-4 w-4" />Move to term</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {terms.length === 0 && (
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            No terms yet — create one first
                          </DropdownMenuLabel>
                        )}
                        {terms.map((t) => (
                          <DropdownMenuItem
                            key={t.id}
                            disabled={c.termId === t.id}
                            onClick={() => onMove(c.id, t.id)}
                          >
                            {t.name} {t.year}
                          </DropdownMenuItem>
                        ))}
                        {c.termId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onMove(c.id, null)}>Unassign</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {c.archived ? (
                      <DropdownMenuItem onClick={() => onArchive(c.id, false)}>
                        <ArchiveRestore className="h-4 w-4" />Restore
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => onArchive(c.id, true)}>
                        <Archive className="h-4 w-4" />Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onDelete(c.id)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
          <div className="flex flex-1 flex-col p-5">
            <Link
              href={`/courses/${c.id}`}
              className="line-clamp-2 font-semibold leading-snug hover:underline"
            >
              {c.title}
            </Link>
            <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted-foreground">
              {c.description || "Course outline"}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              {c.ready && !c.error && <span>{c.topicCount} topics</span>}
              {archivedView && c.termName && <span>· {c.termName}</span>}
            </div>
            {c.ready && !c.error && !c.archived && !archivedView && (
              <div className="mt-3">
                <CoursePlanButton
                  courseId={c.id}
                  courseTitle={c.title}
                  initialTargetDate={c.planTargetDate}
                  remaining={c.topicCount}
                />
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
