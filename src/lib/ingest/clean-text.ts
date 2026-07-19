// Boilerplate removal for extracted PDF pages. Lecture handouts repeat the
// same header/footer on every page ("Taxation Management – FIN623  VU",
// "Page 12 of 131", "©Copyright ..."), which is pure token waste: it rides
// along into EVERY outline batch, lesson, summary, flashcard and chat prompt.
// All functions are pure and idempotent, so they can run both at extraction
// time (new uploads) and at prompt-assembly time (legacy stored resources).

export interface CleanablePage {
  page: number;
  text: string;
}

/** Lines that are just page markers: "3", "Page 3", "3 of 131", "- 12 -". */
const PAGE_NUMBER_LINE =
  /^\s*[-–—]?\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*[-–—]?\s*$/i;

/** How many lines at the top/bottom of a page can be header/footer zone. */
const EDGE_ZONE = 3;
/** A line must repeat on at least this share of pages to count as boilerplate. */
const REPEAT_SHARE = 0.6;
/** Cross-page detection only makes sense with a few pages to compare. */
const MIN_PAGES = 4;
/** Headers/footers are short; never strip long repeated sentences. */
const MAX_BOILERPLATE_LEN = 80;

/** Case/spacing-normalized exact key. Digits are KEPT: two body sentences
 * differing only by a number are different content, not boilerplate. */
function exactKey(line: string): string {
  return line.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Digit-folded key ("Page 3"→"page #") — only ever used for marker-ish
 * lines, so varying page numbers / dates in headers still unify. */
function foldedKey(line: string): string {
  return exactKey(line).replace(/\d+/g, "#");
}

/** Conservative test for lines that may use digit-folded matching: typical
 * header/footer vocabulary or digit-heavy strings. Plain prose never
 * qualifies, so content that differs only by a number is never unified. */
function markerish(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/©|copyright|page|updated|version|handout|university|www\.|https?:/i.test(trimmed)) {
    return true;
  }
  const digits = (trimmed.match(/\d/g) ?? []).length;
  return digits / trimmed.length >= 0.3;
}

/** Per-page cleanup: page-number lines, consecutive duplicates, whitespace. */
export function cleanPageText(text: string): string {
  const out: string[] = [];
  let prev: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/[ \t]+/g, " ").trimEnd();
    if (PAGE_NUMBER_LINE.test(line)) continue;
    // Drop consecutive duplicate lines (extraction artifacts).
    if (line.trim() && line.trim() === prev) continue;
    prev = line.trim() || prev;
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cross-page cleanup for ONE resource: detect lines that repeat near the top
 * or bottom of most pages (headers/footers) and remove them, then apply the
 * per-page cleanup. Only edge-zone lines are ever removed, so legitimately
 * repeated content in the body of a page is safe.
 */
export function cleanResourcePages<T extends CleanablePage>(pages: T[]): T[] {
  if (pages.length < MIN_PAGES) {
    return pages.map((p) => ({ ...p, text: cleanPageText(p.text) }));
  }

  // Short pages must not have their whole body treated as edge zone.
  const zoneFor = (lineCount: number) =>
    Math.min(EDGE_ZONE, Math.max(1, Math.floor(lineCount / 3)));
  const edgeLines = (lines: string[]) => {
    const zone = zoneFor(lines.length);
    return lines.map((raw, i) => ({
      raw,
      inEdge: i < zone || i >= lines.length - zone,
    }));
  };

  // Count how many pages contain each edge-zone line (exact key for all
  // lines; digit-folded key additionally for marker-ish lines).
  const seenExact = new Map<string, number>();
  const seenFolded = new Map<string, number>();
  for (const p of pages) {
    const perPageExact = new Set<string>();
    const perPageFolded = new Set<string>();
    for (const { raw, inEdge } of edgeLines(p.text.split("\n"))) {
      if (!inEdge || !raw.trim() || raw.trim().length > MAX_BOILERPLATE_LEN) continue;
      perPageExact.add(exactKey(raw));
      if (markerish(raw)) perPageFolded.add(foldedKey(raw));
    }
    for (const k of perPageExact) seenExact.set(k, (seenExact.get(k) ?? 0) + 1);
    for (const k of perPageFolded) seenFolded.set(k, (seenFolded.get(k) ?? 0) + 1);
  }

  const threshold = Math.ceil(pages.length * REPEAT_SHARE);
  const exactBoiler = new Set(
    [...seenExact.entries()].filter(([, n]) => n >= threshold).map(([k]) => k)
  );
  const foldedBoiler = new Set(
    [...seenFolded.entries()].filter(([, n]) => n >= threshold).map(([k]) => k)
  );

  return pages.map((p) => {
    const kept = edgeLines(p.text.split("\n"))
      .filter(({ raw, inEdge }) => {
        if (!inEdge) return true;
        if (exactBoiler.has(exactKey(raw))) return false;
        if (markerish(raw) && foldedBoiler.has(foldedKey(raw))) return false;
        return true;
      })
      .map(({ raw }) => raw);
    return { ...p, text: cleanPageText(kept.join("\n")) };
  });
}
