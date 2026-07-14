// Gives each course a stable, distinctive accent + monogram so courses read
// like a shelf of different books instead of identical cards.

const PALETTE = [
  "from-indigo-500 to-violet-600",
  "from-teal-500 to-emerald-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-cyan-500 to-teal-600",
  "from-lime-500 to-green-600",
];

const STOPWORDS = new Set([
  "of", "the", "a", "an", "and", "in", "on", "to", "for", "its", "law",
]);

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function courseGradient(id: string): string {
  return PALETTE[hash(id) % PALETTE.length];
}

/** 2-letter monogram from the most meaningful words of a title. */
export function courseMonogram(title: string): string {
  const words = title
    .replace(/\([^)]*\)/g, " ") // drop parentheticals like (FIN623)
    .split(/[\s:–—-]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  const picks = words.length ? words : title.split(/\s+/);
  const letters = picks.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return (letters.join("") || title.slice(0, 2).toUpperCase()).slice(0, 2);
}

/**
 * A short, recognizable label for the course cover:
 *   1. a course code if the title has one   → "FIN623", "CS101"
 *   2. otherwise the first meaningful word   → "Anatomy"
 *   3. otherwise the 2-letter monogram        → "TM"
 */
export function courseCoverLabel(title: string): string {
  const codeMatch = title.match(/\b([A-Za-z]{2,5}[ -]?\d{3,4}[A-Za-z]?)\b/);
  if (codeMatch) return codeMatch[1].replace(/[ -]/g, "").toUpperCase();

  const words = title
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s:–—-]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  const word = words.find((w) => w.length <= 10);
  if (word) return word;

  return courseMonogram(title);
}
