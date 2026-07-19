import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  Chapter,
  Course,
  CoverageReport,
  ResourcePage,
  Subject,
  Topic,
} from "@/lib/types";
import { generate, parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import { segmentResourcePages } from "@/lib/ingest/source-segments";
import { cleanResourcePages } from "@/lib/ingest/clean-text";

/**
 * Outline generation uses a map-reduce strategy so it scales to large
 * documents and no single AI call is big enough to time out:
 *   1. MAP    — split pages into batches; extract topics from each batch
 *               (in parallel, bounded concurrency).
 *   2. REDUCE — merge batch topics into a subjects -> chapters -> topics tree,
 *               deduping and preserving order.
 *   3. TITLE  — one small call to name the course from the chapter list.
 */

const BATCH_PAGES = 10;
const CONCURRENCY = 4;

const batchSchema = z.object({
  subject: z.string().default("General"),
  topics: z
    .array(
      z.object({
        chapter: z.string().default(""),
        title: z.string().trim().min(2),
        subtopics: z.array(z.string()).default([]),
        summary: z.string().trim().min(4),
        sources: z.array(z.object({ page: z.number() })).min(1),
      })
    )
    .default([]),
});

type BatchResult = z.infer<typeof batchSchema>;

export interface GeneratedOutline {
  title: string;
  description: string;
  subjects: Subject[];
  coverage: CoverageReport;
}

const SYSTEM =
  "You are an expert curriculum designer. You organize a student's uploaded " +
  "study material into a clean, exam-ready structure. You output ONLY valid " +
  "JSON — no prose, no markdown fences.";

/** First ~12 words of a page, for citation display — derived in code so the
 * outline model never spends output tokens hand-writing snippets. */
function sourceSnippet(text: string | undefined): string {
  const words = (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, 12).join(" ");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

function batchPrompt(fileName: string, pages: ResourcePage[]): string {
  const body = pages
    .map((p) => `[[PAGE ${p.page}]]\n${p.text}`)
    .join("\n\n");
  const nums = pages.map((p) => p.page).join(", ");

  return `These are pages ${nums} of study material from "${fileName}".
Identify every distinct topic taught on these pages. Cover everything — do not skip material.

For each topic provide:
- "chapter": the chapter/module/lesson heading it belongs to (copy it from the material if present).
- "title": a concise topic title. If the material labels the section with its own number (e.g. "LESSON 8.36", "Exercise 5"), KEEP that number in the title (e.g. "Taxation of Resident Company (Lesson 8.36)") so students can find it by the number printed in their handouts.
- "subtopics": ordered list of the smaller ideas inside the topic (3-8 where supported).
- "summary": one sentence.
- "sources": the page numbers it appears on.

Also give "subject": the broad subject these pages belong to.

Return ONLY this JSON:
{"subject": string, "topics": [ {"chapter": string, "title": string, "subtopics": [string], "summary": string, "sources": [ {"page": number} ] } ] }

<UNTRUSTED_MATERIAL>
${body}
</UNTRUSTED_MATERIAL>`;
}

async function titlePrompt(
  fileName: string,
  subjectTitles: string[],
  chapterTitles: string[],
  opts: { provider?: "claude" | "codex"; model?: string }
): Promise<{ title: string; description: string }> {
  const prompt = `A course was built from "${fileName}".
Subjects: ${subjectTitles.slice(0, 12).join("; ") || "n/a"}.
Chapters: ${chapterTitles.slice(0, 25).join("; ") || "n/a"}.
Return ONLY JSON: {"title": string, "description": string}. The title names the overall course; the description is one or two sentences.`;
  try {
    const { text } = await generate({
      system: SYSTEM,
      prompt,
      provider: opts.provider,
      model: opts.model,
      timeoutMs: 90000,
      feature: "outline-title",
    });
    const parsed = z
      .object({ title: z.string(), description: z.string().default("") })
      .parse(parseModelJson(text));
    return { title: parsed.title.trim(), description: parsed.description.trim() };
  } catch {
    return {
      title: fileName.replace(/\.[^.]+$/, ""),
      description: "Course generated from your uploaded material.",
    };
  }
}

export async function generateOutline(
  fileName: string,
  pages: ResourcePage[],
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<GeneratedOutline> {
  // Cleaning is idempotent: new uploads arrive pre-cleaned from extraction,
  // and this covers any legacy pages fed in for re-outlining.
  const batches = chunk(segmentResourcePages(cleanResourcePages(pages)), BATCH_PAGES);

  const failedBatchPages: number[] = [];
  let failedBatchCount = 0;
  let lastBatchError: unknown = null;
  const batchResults = await mapWithConcurrency(
    batches,
    CONCURRENCY,
    async (batch) => {
      const prompt = batchPrompt(fileName, batch);
      try {
        return await withQualityRetry({
          feature: "outline-map",
          system: SYSTEM,
          prompt,
          provider: opts.provider,
          model: opts.model,
          timeoutMs: 180000,
          parse: (text) => {
            const parsed = batchSchema.parse(parseModelJson<BatchResult>(text));
            const sourceChars = batch.reduce(
              (total, page) => total + page.text.trim().length,
              0
            );
            if (sourceChars >= 300 && parsed.topics.length === 0) {
              throw new Error("A substantive outline batch cannot be empty.");
            }
            return parsed;
          },
        });
      } catch (error) {
        // A single bad batch (front matter, tables of contents, model slip)
        // must never sink the whole course. Record the gap so coverage
        // reporting can flag those pages for a follow-up pass.
        failedBatchPages.push(...batch.map((p) => p.page));
        failedBatchCount++;
        lastBatchError = error;
        return { subject: "General", topics: [] } as BatchResult;
      }
    }
  );

  // Per-batch tolerance must not mask a total outage (companion down, CLI
  // broken, auth missing): if EVERY batch failed, this is an infrastructure
  // error — surface it so the course is marked failed instead of silently
  // becoming a permanent empty course.
  if (batches.length > 0 && failedBatchCount === batches.length) {
    throw lastBatchError instanceof Error
      ? lastBatchError
      : new Error("Outline generation failed for every batch.");
  }

  const merged = mergeBatches(batchResults, pages, fileName);
  if (failedBatchPages.length > 0) {
    merged.coverage.notes = [
      merged.coverage.notes,
      `Pages ${failedBatchPages.join(", ")} could not be outlined automatically and need a follow-up pass.`,
    ]
      .filter(Boolean)
      .join(" ");
    merged.coverage.flaggedGaps.push(
      `Unprocessed pages: ${failedBatchPages.join(", ")}`
    );
  }

  const chapterTitles = merged.subjects.flatMap((s) =>
    s.chapters.map((c) => c.title)
  );
  const { title, description } = await titlePrompt(
    fileName,
    merged.subjects.map((s) => s.title),
    chapterTitles,
    opts
  );

  // Single uploaded document => single subject named after the course.
  if (merged.subjects.length === 1) merged.subjects[0].title = title;

  return { ...merged, title, description };
}

/** Clean a raw chapter heading and detect its module number for grouping. */
export function analyzeChapter(raw: string): {
  key: string;
  display: string;
  order: number;
} {
  let display = raw.trim();
  // Strip lesson markers so different lessons of a module group together.
  display = display
    .replace(/\(\s*lesson[^)]*\)/gi, "")
    .replace(/[-–—]\s*lesson\s*[\d.]+.*$/i, "")
    .replace(/\blesson\s*[\d.]+\s*:?.*$/i, "")
    .replace(/[-–—:]\s*$/, "")
    .trim();

  const moduleMatch = display.match(/module\s*(\d+)/i);
  // If the cleaned title is ALL CAPS, convert to Title Case for readability.
  if (display && display === display.toUpperCase()) {
    display = display
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .replace(/\bMODULE\b/i, "Module");
  }
  display = display.replace(/^module/i, "Module");

  if (moduleMatch) {
    const n = Number(moduleMatch[1]);
    return { key: `module-${n}`, display: display || `Module ${n}`, order: n };
  }
  return {
    key: `misc-${display.toLowerCase()}`,
    display: display || "Additional material",
    order: 1000,
  };
}

function mergeBatches(
  results: BatchResult[],
  pages: ResourcePage[],
  fileName: string
): Pick<GeneratedOutline, "subjects" | "coverage"> {
  const validPages = new Set(pages.map((p) => p.page));
  const pageText = new Map(pages.map((p) => [p.page, p.text]));
  const mappedPages = new Set<number>();

  // A single uploaded document is one subject; we group topics by module
  // (chapter). chapterKey -> { display, order, topics: Map<topicKey, Topic> }
  const chapters = new Map<
    string,
    { display: string; order: number; topics: Map<string, Topic> }
  >();

  const keyOf = (s: string) => s.trim().toLowerCase();

  for (const batch of results) {
    for (const t of batch.topics) {
      const rawChapter = (t.chapter || batch.subject || "General").trim();
      const info = analyzeChapter(rawChapter);
      if (!chapters.has(info.key)) {
        chapters.set(info.key, {
          display: info.display,
          order: info.order,
          topics: new Map(),
        });
      }
      const chap = chapters.get(info.key)!;
      // Prefer the most descriptive display title seen for this module.
      if (info.display.length > chap.display.length) chap.display = info.display;

      const topicTitle = t.title.trim();
      if (!topicTitle) continue;
      const topicKey = keyOf(topicTitle);

      const sources = t.sources
        .filter((s) => validPages.has(s.page))
        .map((s) => {
          mappedPages.add(s.page);
          return {
            file: fileName,
            page: s.page,
            // Snippet is derived from the real page text (not model-written):
            // accurate, and saves output tokens on every outline-map batch.
            snippet: sourceSnippet(pageText.get(s.page)),
          };
        });

      const existing = chap.topics.get(topicKey);
      if (existing) {
        const subs = new Set(existing.subtopics);
        for (const s of t.subtopics) if (s.trim()) subs.add(s.trim());
        existing.subtopics = Array.from(subs);
        const seen = new Set(existing.sources.map((s) => s.page));
        for (const s of sources) if (!seen.has(s.page)) existing.sources.push(s);
      } else {
        chap.topics.set(topicKey, {
          id: nanoid(10),
          title: topicTitle,
          subtopics: t.subtopics.map((x) => x.trim()).filter(Boolean),
          summary: t.summary.trim(),
          sources,
        });
      }
    }
  }

  const orderedChapters: Chapter[] = Array.from(chapters.values())
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: nanoid(10),
      title: c.display,
      topics: Array.from(c.topics.values()),
    }))
    .filter((c) => c.topics.length > 0);

  const subjectList: Subject[] = [
    { id: nanoid(10), title: fileName.replace(/\.[^.]+$/, ""), chapters: orderedChapters },
  ];

  const coverage: CoverageReport = {
    totalSourceUnits: pages.length,
    mappedSourceUnits: mappedPages.size,
    notes: "",
    flaggedGaps: pages
      .filter((p) => !mappedPages.has(p.page) && p.text.trim().length > 120)
      .map((p) => `Page ${p.page} may not be fully covered`)
      .slice(0, 8),
  };

  return { subjects: subjectList, coverage };
}

/**
 * Merge a freshly-generated outline (from a newly added resource) into an
 * existing course. Existing topics keep their IDs (so progress is preserved);
 * only genuinely new topics/modules are added. Chapters are matched by module.
 */
export function mergeOutlineIntoCourse(
  course: Course,
  incoming: GeneratedOutline
): { subjects: Subject[]; coverage: CoverageReport } {
  const keyOf = (s: string) => s.trim().toLowerCase();

  // Work within the course's single subject (create one if absent).
  const subject: Subject =
    course.subjects[0] ?? { id: nanoid(10), title: course.title, chapters: [] };
  const chapters: Chapter[] = subject.chapters.map((c) => ({
    ...c,
    topics: [...c.topics],
  }));

  const chapterByKey = new Map<string, Chapter>();
  for (const c of chapters) chapterByKey.set(analyzeChapter(c.title).key, c);

  let added = 0;
  for (const s of incoming.subjects)
    for (const inc of s.chapters) {
      const key = analyzeChapter(inc.title).key;
      const existing = chapterByKey.get(key);
      if (existing) {
        const titles = new Set(existing.topics.map((t) => keyOf(t.title)));
        for (const t of inc.topics) {
          if (!titles.has(keyOf(t.title))) {
            existing.topics.push(t);
            titles.add(keyOf(t.title));
            added++;
          }
        }
      } else {
        chapters.push(inc);
        chapterByKey.set(key, inc);
        added += inc.topics.length;
      }
    }

  // Keep modules in order.
  chapters.sort((a, b) => analyzeChapter(a.title).order - analyzeChapter(b.title).order);

  const coverage: CoverageReport = {
    totalSourceUnits:
      course.coverage.totalSourceUnits + incoming.coverage.totalSourceUnits,
    mappedSourceUnits:
      course.coverage.mappedSourceUnits + incoming.coverage.mappedSourceUnits,
    notes: course.coverage.notes,
    flaggedGaps: [...course.coverage.flaggedGaps, ...incoming.coverage.flaggedGaps].slice(0, 12),
  };

  return {
    subjects: [{ ...subject, chapters }],
    coverage,
  };
}
