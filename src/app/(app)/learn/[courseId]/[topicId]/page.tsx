"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  RefreshCw,
  Send,
  Sparkles,
  FileText,
  Lightbulb,
  GraduationCap,
  ClipboardList,
  ScrollText,
  HelpCircle,
  X as XIcon,
  ListTree,
  Layers,
  Baby,
  Brain,
  Languages,
  MoreHorizontal,
} from "lucide-react";
import { TopicNavigator } from "@/components/topic-navigator";
import { SourceDrawer } from "@/components/source-drawer";
import { LessonAudio } from "@/components/lesson-audio";
import { LessonVisuals } from "@/components/lesson-visuals";
import { Generating } from "@/components/generating";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "@/components/rich-text";
import { api, ApiError } from "@/lib/client";
import {
  readLessonLanguage,
  writeLessonLanguage,
  type ContentLanguage,
} from "@/lib/use-lesson-language";
import { useToast } from "@/components/ui/use-toast";
import type { Lesson } from "@/lib/teach/lesson";
import type { Summary } from "@/lib/teach/summary";
import type { SourceRef, TopicProgress, TutorChatMessage } from "@/lib/types";

interface LessonPayload {
  lesson: Lesson;
  topic: { id: string; title: string; subtopics: string[]; sources: SourceRef[] };
  nav: {
    chapterTitle: string;
    subjectTitle: string;
    index: number;
    total: number;
    prevId: string | null;
    nextId: string | null;
  };
  progress: TopicProgress;
}

/** Flatten a lesson into clean, speakable/plain text (for TTS + read-time). */
function lessonToText(lesson: Lesson): string {
  const parts: string[] = [];
  if (lesson.intro) parts.push(lesson.intro);
  for (const d of lesson.keyDefinitions) parts.push(`${d.term}. ${d.definition}`);
  for (const s of lesson.sections) parts.push(`${s.heading}. ${s.content}`);
  for (const e of lesson.examples) parts.push(`${e.title}. ${e.content}`);
  if (lesson.examTips.length) parts.push(`Exam tips. ${lesson.examTips.join(". ")}`);
  return parts
    .join("\n")
    .replace(/[*_`#>|]/g, "") // strip markdown noise
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → label
    .replace(/[ \t]+/g, " ")
    .trim();
}

export default function LearnPage() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<LessonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [language, setLanguage] = useState<ContentLanguage>("en");

  const load = useCallback(
    async (opts?: {
      regenerate?: boolean;
      depth?: "simpler" | "deeper";
      language?: ContentLanguage;
      /** true = re-render in place (keep showing the current lesson + spinner). */
      switching?: boolean;
    }) => {
      const busy = !!opts?.regenerate || !!opts?.depth || !!opts?.switching;
      setLoading(!busy);
      setRegenerating(busy);
      setError(null);
      try {
        const res = await api.post<LessonPayload>("/api/learn/lesson", {
          courseId,
          topicId,
          regenerate: opts?.regenerate,
          depth: opts?.depth,
          language: opts?.language ?? language,
        });
        setData(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load the lesson.");
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [courseId, topicId, language]
  );

  // On mount / topic change, restore the reader's saved language and load once.
  // We drive (re)loads explicitly (below), so this depends on the topic — not
  // on `load` — to avoid a double fetch when the language state settles.
  useEffect(() => {
    const saved = readLessonLanguage();
    setLanguage(saved);
    load({ language: saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, topicId]);

  const switchLanguage = useCallback(
    (lng: ContentLanguage) => {
      writeLessonLanguage(lng);
      setLanguage(lng);
      load({ language: lng, switching: true });
    },
    [load]
  );

  if (loading) return <LessonLoading />;

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">
              The lesson is generated by your local AI companion. Make sure it&apos;s
              running (<code className="rounded bg-secondary px-1">npm run companion</code>).
            </p>
            <div className="flex gap-2">
              <Button onClick={() => load()}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href={`/courses/${courseId}`}>Back to course</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <LessonView
      key={data.topic.id}
      data={data}
      courseId={courseId}
      language={language}
      onLanguage={switchLanguage}
      onRegenerate={() => load({ regenerate: true })}
      onDepth={(d) => load({ depth: d })}
      regenerating={regenerating}
      onPatch={(p) =>
        setData((d) => (d ? { ...d, progress: { ...d.progress, ...p } } : d))
      }
      goto={(id) => router.push(`/learn/${courseId}/${id}`)}
      toast={toast}
    />
  );
}

function LessonLoading() {
  return (
    <Generating
      icon={Sparkles}
      title="Preparing your lesson"
      steps={[
        "Reading your source material",
        "Explaining it step by step",
        "Adding examples & exam tips",
        "Almost ready…",
      ]}
    />
  );
}

function LessonView({
  data,
  courseId,
  language,
  onLanguage,
  onRegenerate,
  onDepth,
  regenerating,
  onPatch,
  goto,
  toast,
}: {
  data: LessonPayload;
  courseId: string;
  language: "en" | "roman-ur";
  onLanguage: (lng: "en" | "roman-ur") => void;
  onRegenerate: () => void;
  onDepth: (d: "simpler" | "deeper") => void;
  regenerating: boolean;
  onPatch: (p: Partial<TopicProgress>) => void;
  goto: (id: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { lesson, topic, nav, progress } = data;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const prefetched = useRef<Set<string>>(new Set());

  // Switching language reloads the lesson in place; drop any already-loaded
  // summary so re-opening "Summarize" fetches it in the new language.
  useEffect(() => {
    setSummary(null);
    setShowSummary(false);
  }, [language]);

  // Warm the next topic's lesson in the background so "Next" feels instant.
  // Mark the id only inside the timer (not at effect-run time) so React 18
  // StrictMode's mount→cleanup→remount doesn't cancel then skip the prefetch.
  useEffect(() => {
    const nextId = nav.nextId;
    if (!nextId) return;
    // Key the warm cache by language too, so switching re-warms in the new one.
    const key = `${nextId}:${language}`;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled || prefetched.current.has(key)) return;
      prefetched.current.add(key);
      api
        .post("/api/learn/lesson", { courseId, topicId: nextId, prefetch: true, language })
        .catch(() => {});
    }, 1500); // let the current lesson settle first
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [nav.nextId, courseId, language]);

  async function loadSummary() {
    if (summary) {
      setShowSummary((s) => !s);
      return;
    }
    setSummaryLoading(true);
    setShowSummary(true);
    try {
      const res = await api.post<{ summary: Summary }>("/api/learn/summary", {
        courseId,
        topicId: topic.id,
        language,
      });
      setSummary(res.summary);
    } catch (err) {
      toast({
        title: "Could not summarize",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
      setShowSummary(false);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function patch(body: Partial<TopicProgress>) {
    onPatch(body);
    try {
      await api.patch("/api/progress", { courseId, topicId: topic.id, ...body });
    } catch {
      toast({ title: "Could not save progress", variant: "destructive" });
    }
  }

  async function markComplete() {
    await patch({ status: "completed" });
    toast({ title: "Marked as completed" });
    if (nav.nextId) goto(nav.nextId);
  }

  const isDone = ["completed", "mastered"].includes(progress.status);

  return (
    <div className="mx-auto max-w-6xl">
      <TopicNavigator
        courseId={courseId}
        currentTopicId={topic.id}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={(id) => {
          setNavOpen(false);
          goto(id);
        }}
      />
      <SourceDrawer courseId={courseId} page={sourcePage} onClose={() => setSourcePage(null)} />
      {/* Breadcrumb + header */}
      <div className="mb-5">
        <Link
          href={`/courses/${courseId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {nav.subjectTitle}
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{nav.chapterTitle}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{topic.title}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              Topic {nav.index + 1} of {nav.total}
              {language === "roman-ur" && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Languages className="h-3 w-3" />
                  Roman Urdu
                </Badge>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setNavOpen(true)}>
              <ListTree className="h-4 w-4" />
              Contents
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/flashcards/${courseId}/${topic.id}`}>
                <Layers className="h-4 w-4" />
                Flashcards
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={loadSummary} disabled={summaryLoading}>
              {summaryLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScrollText className="h-4 w-4" />
              )}
              {showSummary && summary ? "Hide summary" : "Summarize"}
            </Button>

            {/* Secondary actions collapse into a menu so the header stays tidy on any screen */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => patch({ bookmarked: !progress.bookmarked })}>
                  {progress.bookmarked ? (
                    <BookmarkCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  {progress.bookmarked ? "Bookmarked" : "Bookmark this topic"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDepth("simpler")} disabled={regenerating}>
                  <Baby className="h-4 w-4" />
                  Explain it simpler
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDepth("deeper")} disabled={regenerating}>
                  <Brain className="h-4 w-4" />
                  Go deeper
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {language === "roman-ur" ? (
                  <DropdownMenuItem onClick={() => onLanguage("en")} disabled={regenerating}>
                    <Languages className="h-4 w-4" />
                    Read in English
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onLanguage("roman-ur")}
                    disabled={regenerating}
                  >
                    <Languages className="h-4 w-4" />
                    Roman Urdu mein parhein
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRegenerate} disabled={regenerating}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate lesson
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lesson */}
        <div className="space-y-5 lg:col-span-2">
          <LessonAudio text={lessonToText(lesson)} showListen={language !== "roman-ur"} />
          {showSummary && (
            <Card className="border-primary/30 bg-accent/40">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <ScrollText className="h-4 w-4 text-primary" />
                    Quick summary
                  </h2>
                  <button
                    onClick={() => setShowSummary(false)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Hide summary"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                {summaryLoading || !summary ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Summarizing this topic…
                  </div>
                ) : (
                  <div className="space-y-4 text-[15px]">
                    {summary.tldr && <p className="leading-relaxed">{summary.tldr}</p>}
                    {summary.keyPoints.length > 0 && (
                      <div>
                        <p className="mb-1 text-sm font-medium text-muted-foreground">Key points</p>
                        <ul className="ml-5 list-disc space-y-1 text-sm">
                          {summary.keyPoints.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {summary.keyTerms.length > 0 && (
                      <div>
                        <p className="mb-1 text-sm font-medium text-muted-foreground">Key terms</p>
                        <ul className="space-y-1 text-sm">
                          {summary.keyTerms.map((t, i) => (
                            <li key={i}>
                              <span className="font-medium">{t.term}:</span> {t.definition}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {lesson.intro && (
            <Card>
              <CardContent className="p-5">
                <RichText text={lesson.intro} className="text-[15px]" />
              </CardContent>
            </Card>
          )}

          {lesson.keyDefinitions.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <FileText className="h-4 w-4 text-primary" />
                Key definitions
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {lesson.keyDefinitions.map((d, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="font-medium">{d.term}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{d.definition}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {lesson.sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-2 text-lg font-semibold">{s.heading}</h2>
              <div className="text-[15px] text-foreground/90">
                <RichText text={s.content} />
              </div>
              {s.pages.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  Source:
                  {s.pages.map((pg, k) => (
                    <button
                      key={k}
                      onClick={() => setSourcePage(pg)}
                      className="rounded bg-secondary px-1.5 py-0.5 font-medium text-primary transition hover:bg-accent"
                      title="View this page from your material"
                    >
                      p.{pg}
                    </button>
                  ))}
                </p>
              )}
            </section>
          ))}

          {lesson.visuals.length > 0 && <LessonVisuals visuals={lesson.visuals} />}

          {lesson.examples.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Lightbulb className="h-4 w-4 text-warning" />
                Examples
              </h2>
              <div className="space-y-3">
                {lesson.examples.map((e, i) => (
                  <Card key={i} className="border-l-4 border-l-warning/60">
                    <CardContent className="p-4">
                      <p className="mb-1 font-medium">{e.title}</p>
                      <RichText text={e.content} className="text-sm text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {lesson.examTips.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <GraduationCap className="h-4 w-4 text-success" />
                Exam-important points
              </h2>
              <Card className="bg-success/5">
                <CardContent className="p-4">
                  <ul className="ml-5 list-disc space-y-1.5 text-sm">
                    {lesson.examTips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {lesson.selfCheck.length > 0 && <SelfCheck items={lesson.selfCheck} />}

          {lesson.citations.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Sources from your material · tap to verify
              </h2>
              <div className="flex flex-wrap gap-2">
                {lesson.citations.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSourcePage(c.page)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-left text-xs text-muted-foreground transition hover:border-primary hover:bg-accent hover:text-accent-foreground"
                    title="View this page from your material"
                  >
                    <span className="font-medium text-primary">p.{c.page}</span>
                    {c.snippet ? ` · “${c.snippet}”` : ""}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Bottom navigation */}
          <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!nav.prevId}
                onClick={() => nav.prevId && goto(nav.prevId)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!nav.nextId}
                onClick={() => nav.nextId && goto(nav.nextId)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={markComplete} variant="outline">
                <CheckCircle2 className={isDone ? "h-4 w-4 text-success" : "h-4 w-4"} />
                {isDone ? "Completed" : "Mark done"}
              </Button>
              <Button asChild>
                <Link href={`/quiz/${courseId}/${topic.id}`}>
                  <ClipboardList className="h-4 w-4" />
                  Test yourself
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Right rail: tutor chat + notes */}
        <div className="space-y-5">
          <TutorChat
            courseId={courseId}
            topicId={topic.id}
            topicTitle={topic.title}
            language={language}
          />
          <NotesCard
            initial={progress.notes}
            onSave={(notes) => patch({ notes })}
          />
        </div>
      </div>
    </div>
  );
}

/** Active-recall block: the student tries each question, then reveals the
 * answer. A quick self-test before the graded quiz, right where they finish
 * reading. */
function SelfCheck({ items }: { items: { question: string; answer: string }[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <HelpCircle className="h-4 w-4 text-primary" />
        Check yourself
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Try each one in your head first — then reveal the answer to see how you did.
      </p>
      <div className="space-y-3">
        {items.map((item, i) => {
          const open = revealed.has(i);
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="font-medium">
                  {i + 1}. {item.question}
                </p>
                {open && (
                  <div className="mt-2 rounded-md bg-secondary/60 p-3 text-sm text-foreground/90">
                    <RichText text={item.answer} />
                  </div>
                )}
                <button
                  onClick={() => toggle(i)}
                  className="mt-2 text-sm font-medium text-primary hover:underline"
                >
                  {open ? "Hide answer" : "Reveal answer"}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

const QUICK_PROMPTS = [
  "Explain this more simply",
  "Give me an example",
  "Quiz me on this topic",
  "What's most important for the exam?",
] as const;

function TutorChat({
  courseId,
  topicId,
  topicTitle,
  language,
}: {
  courseId: string;
  topicId: string;
  topicTitle: string;
  language: ContentLanguage;
}) {
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    api
      .get<{ messages: TutorChatMessage[] }>(
        `/api/learn/chat?courseId=${encodeURIComponent(courseId)}&topicId=${encodeURIComponent(topicId)}`
      )
      .then((result) => {
        if (active) setMessages(result.messages);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [courseId, topicId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    const temporaryId = `pending-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: temporaryId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    setSending(true);
    try {
      const res = await api.post<{
        reply: string;
        messages: TutorChatMessage[];
      }>("/api/learn/chat", {
        courseId,
        topicId,
        message: text,
        language,
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== temporaryId),
        ...res.messages,
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            err instanceof ApiError
              ? `Warning: ${err.message}`
              : "Warning: Could not reach the tutor.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex h-[460px] flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Ask your tutor</p>
      </div>
      <div ref={scrollRef} className="scroll-slim flex-1 space-y-3 overflow-y-auto p-3">
        {loadingHistory && messages.length === 0 && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your tutor history...
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="mt-4 space-y-3 px-1">
            <p className="px-1 text-center text-sm text-muted-foreground">
              Stuck on “{topicTitle}”? Ask anything — answers are grounded in your material.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={sending}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "mr-auto max-w-[90%] rounded-lg rounded-bl-sm bg-secondary px-3 py-2 text-sm"
            }
          >
            {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
          </div>
        ))}
        {sending && (
          <div className="mr-auto flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </div>
      <div className="border-t border-border">
        {messages.length > 0 && (
          <div className="scroll-slim flex gap-1.5 overflow-x-auto px-3 pt-2.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={sending}
                className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/70 transition hover:border-primary hover:text-accent-foreground disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a follow-up…"
          className="max-h-24 min-h-[40px] resize-none"
          rows={1}
        />
        <Button size="icon" onClick={() => send()} disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
        </div>
      </div>
    </Card>
  );
}

function NotesCard({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (notes: string) => Promise<void> | void;
}) {
  const [notes, setNotes] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const savedRef = useRef(initial);

  const persist = useCallback(
    async (value: string) => {
      if (value === savedRef.current) return;
      setStatus("saving");
      try {
        await onSave(value);
        savedRef.current = value;
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    },
    [onSave]
  );

  // Debounced autosave so notes are never lost to a missed blur (common on mobile).
  useEffect(() => {
    if (notes === savedRef.current) return;
    const t = setTimeout(() => persist(notes), 900);
    return () => clearTimeout(t);
  }, [notes, persist]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">My notes</p>
          <span className="text-xs text-muted-foreground">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : ""}
          </span>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => persist(notes)}
          placeholder="Jot down anything you want to remember…"
          className="min-h-[100px] resize-none text-sm"
        />
      </CardContent>
    </Card>
  );
}
