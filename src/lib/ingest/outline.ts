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

/**
 * Outline generation uses a map-reduce strategy so it scales to large
 * documents and no single AI call is big enough to time out:
 *   1. MAP    — split pages into batches; extract topics from each batch
 *               (in parallel, bounded concurrency).
 *   2. REDUCE — merge batch topics into a subjects -> chapters -> topics tree,
 *               deduping and preserving order.
 *   3. TITLE  — one small call to name the course from the chapter list.
 */

const BATCH_PAGES = 15;
const CONCURRENCY = 4;
const CHARS_PER_PAGE = 1500;

const batchSchema = z.object({
  subject: z.string().default("General"),
  topics: z
    .array(
      z.object({
        chapter: z.string().default(""),
        title: z.string(),
        subtopics: z.array(z.string()).default([]),
        summary: z.string().default(""),
        examImportance: z.string().default(""),
        sources: z
          .array(
            z.object({
              page: z.number(),
              snippet: z.string().default(""),
            })
          )
          .default([]),
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
    .map((p) => `[[PAGE ${p.page}]]\n${p.text.slice(0, CHARS_PER_PAGE)}`)
    .join("\n\n");
  const nums = pages.map((p) => p.page).join(", ");

  return `These are pages ${nums} of study material from "${fileName}".
Identify every distinct topic taught on these pages. Cover everything — do not skip material.

For each topic provide:
- "chapter": the chapter/module/lesson heading it belongs to (copy it from the material if present).
- "title": a concise topic title.
- "subtopics": ordered list of the smaller ideas inside the topic (3-8 where supported).
- "summary": one sentence.
- "examImportance": one sentence on why it matters for exams.
- "sources": the page numbers it appears on, each with a short verbatim "snippet" (<= 12 words) from that page.

Also give "subject": the broad subject these pages belong to.

Return ONLY this JSON:
{"subject": string, "topics": [ {"chapter": string, "title": string, "subtopics": [string], "summary": string, "examImportance": string, "sources": [ {"page": number, "snippet": string} ] } ] }

<UNTRUSTED_MATERIAL>
${body}
</UNTRUSTED_MATERIAL>`;
}

async function titlePrompt(
  fileName: string,
  subjectTitles: string[],
  chapterTitles: string[]
): Promise<{ title: string; description: string }> {
  const prompt = `A course was built from "${fileName}".
Subjects: ${subjectTitles.slice(0, 12).join("; ") || "n/a"}.
Chapters: ${chapterTitles.slice(0, 25).join("; ") || "n/a"}.
Return ONLY JSON: {"title": string, "description": string}. The title names the overall course; the description is one or two sentences.`;
  try {
    const { text } = await generate({ system: SYSTEM, prompt, timeoutMs: 90000 });
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
  const batches = chunk(pages, BATCH_PAGES);

  const batchResults = await mapWithConcurrency(
    batches,
    CONCURRENCY,
    async (batch) => {
      const { text } = await generate({
        system: SYSTEM,
        prompt: batchPrompt(fileName, batch),
        provider: opts.provider,
        model: opts.model,
        timeoutMs: 180000,
      });
      try {
        return batchSchema.parse(parseModelJson<BatchResult>(text));
      } catch {
        // A single bad batch shouldn't sink the whole outline.
        return { subject: "General", topics: [] } as BatchResult;
      }
    }
  );

  const merged = mergeBatches(batchResults, pages, fileName);

  const chapterTitles = merged.subjects.flatMap((s) =>
    s.chapters.map((c) => c.title)
  );
  const { title, description } = await titlePrompt(
    fileName,
    merged.subjects.map((s) => s.title),
    chapterTitles
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
            snippet: s.snippet.trim().slice(0, 200),
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
          examImportance: t.examImportance.trim(),
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
