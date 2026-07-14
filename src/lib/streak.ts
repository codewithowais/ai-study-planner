// Study-streak math. Pure & deterministic given a list of study dates and
// "today" (so the dashboard and tests can pass a fixed date).

/** Local date as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDateKey(dt);
}

export interface StreakInfo {
  current: number;
  longest: number;
  studiedToday: boolean;
}

/**
 * Current streak = consecutive days ending today (or yesterday, so a streak
 * isn't "broken" until a full day is missed). Longest = best run ever.
 */
export function computeStreak(days: string[], todayKey = localDateKey()): StreakInfo {
  const set = new Set(days);
  const studiedToday = set.has(todayKey);

  // Anchor: today if studied today, else yesterday (grace until the day ends).
  let cursor = studiedToday ? todayKey : addDays(todayKey, -1);
  let current = 0;
  if (set.has(cursor)) {
    while (set.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }

  // Longest run across the sorted, de-duplicated history.
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev && addDays(prev, 1) === key) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = key;
  }

  return { current, longest: Math.max(longest, current), studiedToday };
}
