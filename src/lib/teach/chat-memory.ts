import type { TutorChatMessage } from "@/lib/types";

export type TutorMessageLike = TutorChatMessage;

export interface TutorContextOptions {
  recentMessageLimit?: number;
  recentCharBudget?: number;
  memoryCharBudget?: number;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, Math.max(0, limit));
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

function transcriptLine(message: TutorMessageLike): string {
  return `${message.role === "user" ? "Student" : "Tutor"}: ${clean(message.content)}`;
}

function memoryLine(message: TutorMessageLike): string {
  const label = message.role === "user" ? "Student asked" : "Tutor explained";
  return `${label}: ${truncate(clean(message.content), 520)}`;
}

const STOP_WORDS = new Set([
  "about",
  "again",
  "from",
  "have",
  "into",
  "that",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

function keywords(text: string): Set<string> {
  return new Set(
    clean(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length >= 4 && !STOP_WORDS.has(word)) ?? []
  );
}

function relevantOrder(
  messages: TutorMessageLike[],
  messageKeywords: Set<string>[],
  query: string
): number[] {
  const queryWords = keywords(query);
  const scored = messages
    .map((message, index) => {
      const overlap = Array.from(messageKeywords[index]).filter((word) =>
        queryWords.has(word)
      ).length;
      return { index, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || right.index - left.index);

  const order: number[] = [];
  const seen = new Set<number>();
  const add = (index: number) => {
    if (index >= 0 && index < messages.length && !seen.has(index)) {
      seen.add(index);
      order.push(index);
    }
  };

  for (const item of scored) {
    // Preserve the surrounding question/answer pair when one side is relevant.
    const pairStart = item.index - (item.index % 2);
    add(pairStart);
    add(pairStart + 1);
  }
  add(0);
  add(1);
  for (let index = messages.length - 1; index >= 0; index--) add(index);
  return order;
}

function selectRecent(
  messages: TutorMessageLike[],
  limit: number,
  charBudget: number
): { messages: TutorMessageLike[]; transcript: string; startIndex: number } {
  const selected: TutorMessageLike[] = [];
  const lines: string[] = [];
  let used = 0;
  let startIndex = messages.length;

  for (let index = messages.length - 1; index >= 0 && selected.length < limit; index--) {
    const full = transcriptLine(messages[index]);
    const separator = lines.length ? 2 : 0;
    const remaining = charBudget - used - separator;
    if (remaining <= 0) break;

    if (full.length > remaining) {
      // The latest message must always survive. Older oversized messages can
      // remain in durable storage without displacing the latest turn.
      if (selected.length > 0) break;
      lines.unshift(truncate(full, remaining));
      selected.unshift(messages[index]);
      startIndex = index;
      used += remaining;
      break;
    }

    lines.unshift(full);
    selected.unshift(messages[index]);
    startIndex = index;
    used += full.length + separator;
  }

  return { messages: selected, transcript: lines.join("\n\n"), startIndex };
}

function compactOlder(
  messages: TutorMessageLike[],
  messageKeywords: Set<string>[],
  charBudget: number,
  query: string
): string {
  const selected = new Map<number, string>();
  let used = 0;

  for (const index of relevantOrder(messages, messageKeywords, query)) {
    const full = memoryLine(messages[index]);
    const separator = selected.size ? 1 : 0;
    const remaining = charBudget - used - separator;
    if (remaining <= 0) break;
    if (full.length > remaining) {
      if (selected.size === 0) {
        selected.set(index, truncate(full, remaining));
        used += remaining; // the truncated line still consumes the budget
      }
      continue;
    }
    selected.set(index, full);
    used += full.length + separator;
  }
  return Array.from(selected.entries())
    .sort(([left], [right]) => left - right)
    .map(([, line]) => line)
    .join("\n");
}

export function prepareTutorContext(
  messages: TutorMessageLike[],
  options: TutorContextOptions = {}
) {
  const recentMessageLimit = options.recentMessageLimit ?? 6;
  const recentCharBudget = options.recentCharBudget ?? 8_000;
  const memoryCharBudget = options.memoryCharBudget ?? 6_000;
  const recent = selectRecent(messages, recentMessageLimit, recentCharBudget);
  const latestQuestion =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const olderMessages = messages.slice(0, recent.startIndex);
  // Tokenize each older message once per call; keywords() is otherwise re-run inside loops.
  const olderKeywords = olderMessages.map((message) => keywords(message.content));
  const compactMemory = compactOlder(
    olderMessages,
    olderKeywords,
    memoryCharBudget,
    latestQuestion
  );

  return {
    compactMemory,
    recentMessages: recent.messages,
    recentTranscript: recent.transcript,
  };
}

export function buildTutorPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  material: string;
  compactMemory: string;
  recentTranscript: string;
}): string {
  const { topicTitle, chapterTitle, material, compactMemory, recentTranscript } = params;
  return `Topic: "${topicTitle}" (chapter: ${chapterTitle}).

<UNTRUSTED_MATERIAL>
${material || "(no extracted material for this topic)"}
</UNTRUSTED_MATERIAL>

Prior tutor memory:
${compactMemory || "(no older conversation)"}

Recent conversation:
${recentTranscript}

Answer the student's latest message.`;
}
