export interface SourcePageLike {
  page: number;
  text: string;
}

/** Split large pages with overlap so no source text is silently discarded. */
export function segmentResourcePages<T extends SourcePageLike>(
  pages: T[],
  maxChars = 2_500,
  overlapChars = 200
): SourcePageLike[] {
  if (maxChars < 50) throw new Error("Source segments must be at least 50 characters.");
  const overlap = Math.max(0, Math.min(overlapChars, maxChars - 1));
  const segments: SourcePageLike[] = [];

  for (const page of pages) {
    if (page.text.length <= maxChars) {
      segments.push({ page: page.page, text: page.text });
      continue;
    }

    let start = 0;
    while (start < page.text.length) {
      let end = Math.min(page.text.length, start + maxChars);
      if (end < page.text.length) {
        const minimumBreak = start + Math.floor(maxChars * 0.65);
        const newline = page.text.lastIndexOf("\n", end);
        const space = page.text.lastIndexOf(" ", end);
        const naturalBreak = Math.max(newline, space);
        if (naturalBreak >= minimumBreak) end = naturalBreak;
      }

      segments.push({ page: page.page, text: page.text.slice(start, end) });
      if (end >= page.text.length) break;
      start = Math.max(start + 1, end - overlap);
    }
  }

  return segments;
}
