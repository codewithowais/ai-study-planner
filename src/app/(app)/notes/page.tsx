import Link from "next/link";
import { StickyNote, BookmarkCheck, GraduationCap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProgress, listActiveCourses } from "@/lib/store/repositories";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Item {
  courseId: string;
  courseTitle: string;
  topicId: string;
  topicTitle: string;
  chapterTitle: string;
  notes: string;
  bookmarked: boolean;
}

export default async function NotesPage() {
  const user = await getCurrentUser();
  const courses = user ? await listActiveCourses(user.id) : [];
  const ready = courses.filter((c) => c.ready && !c.error);

  const items: Item[] = [];
  for (const course of ready) {
    const progress = await getProgress(course.id);
    if (!progress) continue;
    for (const s of course.subjects)
      for (const c of s.chapters)
        for (const t of c.topics) {
          const e = progress.topics[t.id];
          if (!e) continue;
          if (e.bookmarked || (e.notes && e.notes.trim())) {
            items.push({
              courseId: course.id,
              courseTitle: course.title,
              topicId: t.id,
              topicTitle: t.title,
              chapterTitle: c.title,
              notes: e.notes?.trim() ?? "",
              bookmarked: e.bookmarked,
            });
          }
        }
  }

  const bookmarks = items.filter((i) => i.bookmarked);
  const notes = items.filter((i) => i.notes);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notes & bookmarks"
        description="Everything you've bookmarked or written notes on, in one place."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes or bookmarks yet"
          description="Bookmark a topic or jot down notes while learning, and they'll appear here."
          action={
            <Button asChild>
              <Link href="/learn">
                <GraduationCap className="h-4 w-4" />
                Go to Learn
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {bookmarks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <BookmarkCheck className="h-4 w-4 text-primary" />
                Bookmarks ({bookmarks.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {bookmarks.map((b) => (
                  <Link key={b.topicId} href={`/learn/${b.courseId}/${b.topicId}`}>
                    <Card className="h-full transition hover:shadow-md">
                      <CardContent className="p-4">
                        <p className="font-medium">{b.topicTitle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {b.courseTitle} · {b.chapterTitle}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {notes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <StickyNote className="h-4 w-4 text-primary" />
                Notes ({notes.length})
              </h2>
              <div className="space-y-3">
                {notes.map((n) => (
                  <Card key={n.topicId}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{n.topicTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {n.courseTitle} · {n.chapterTitle}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link href={`/learn/${n.courseId}/${n.topicId}`}>Open</Link>
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap rounded-md bg-secondary/50 p-3 text-sm text-foreground/90">
                        {n.notes}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
