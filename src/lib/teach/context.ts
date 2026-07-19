import type { Course, ResourcePage, Topic } from "@/lib/types";
import { getResource } from "@/lib/store/repositories";
import { cleanResourcePages } from "@/lib/ingest/clean-text";

export interface TopicLocation {
  topic: Topic;
  chapterTitle: string;
  subjectTitle: string;
  /** Flat ordered list of all topic ids in the course, for prev/next. */
  order: string[];
  index: number;
}

export function locateTopic(course: Course, topicId: string): TopicLocation | null {
  const order: string[] = [];
  let found: Omit<TopicLocation, "order" | "index"> | null = null;
  for (const s of course.subjects)
    for (const c of s.chapters)
      for (const t of c.topics) {
        order.push(t.id);
        if (t.id === topicId)
          found = { topic: t, chapterTitle: c.title, subjectTitle: s.title };
      }
  if (!found) return null;
  return { ...found, order, index: order.indexOf(topicId) };
}

/**
 * Gather the source page text that grounds a topic. Pulls the topic's cited
 * pages (plus immediate neighbours for continuity) from the course resources.
 * Returned text is UNTRUSTED and must be wrapped by callers.
 */
export async function gatherSourceText(
  course: Course,
  topic: Topic,
  maxChars = 14000
): Promise<{ file: string; page: number; text: string }[]> {
  // Pages are numbered per-file, so we key by "<file>::<page>" to avoid
  // collisions when a course has multiple resources.
  const key = (file: string, page: number) => `${file}::${page}`;

  const wanted = new Map<string, { file: string; page: number }>();
  for (const s of topic.sources) {
    wanted.set(key(s.file, s.page), { file: s.file, page: s.page });
    // a topic often spills onto the next page of the same file
    wanted.set(key(s.file, s.page + 1), { file: s.file, page: s.page + 1 });
  }

  // Build a "<file>::<page>" -> text map from all resources on the course.
  const pageText = new Map<string, string>();
  const knownFiles = new Set<string>();
  for (const rid of course.resourceIds) {
    const resource = await getResource(rid);
    if (!resource) continue;
    knownFiles.add(resource.fileName);
    // Legacy resources were stored before extraction-time cleaning; cleaning
    // is idempotent, so applying it here covers them (headers/footers/page
    // markers are pure token waste in every prompt). Runs only on cache miss.
    for (const p of cleanResourcePages(resource.pages as ResourcePage[])) {
      pageText.set(key(resource.fileName, p.page), p.text);
    }
  }

  const chosen = Array.from(wanted.values())
    .map((w) => {
      // Tolerate older citations that lack a file name: match by page only.
      if (w.file && pageText.has(key(w.file, w.page))) return w;
      if (!w.file || !knownFiles.has(w.file)) {
        for (const f of knownFiles) {
          if (pageText.has(key(f, w.page))) return { file: f, page: w.page };
        }
      }
      return null;
    })
    .filter((w): w is { file: string; page: number } => w !== null)
    .sort((a, b) => (a.file === b.file ? a.page - b.page : a.file.localeCompare(b.file)));

  const out: { file: string; page: number; text: string }[] = [];
  let used = 0;
  const seen = new Set<string>();
  for (const w of chosen) {
    const k = key(w.file, w.page);
    if (seen.has(k)) continue;
    seen.add(k);
    const text = pageText.get(k)!;
    if (used + text.length > maxChars) {
      out.push({
        file: w.file,
        page: w.page,
        text: text.slice(0, Math.max(0, maxChars - used)),
      });
      break;
    }
    out.push({ file: w.file, page: w.page, text });
    used += text.length;
  }
  return out;
}
