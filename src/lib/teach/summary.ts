import type { Topic } from "@/lib/types";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import { summarySchema, type Summary } from "@/lib/teach/content-quality";

export { summarySchema };
export type { Summary };
export const SUMMARY_PROMPT_VERSION = 3;

const SYSTEM =
  "You write plain-spoken, high-yield, exam-focused revision summaries from a student's own " +
  "material. Output ONLY valid JSON — no prose, no markdown fences.";

export async function generateSummary(
  params: { topic: Topic; chapterTitle: string; sources: { page: number; text: string }[] },
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<Summary> {
  const { topic, chapterTitle, sources } = params;
  const material = sources.map((s) => `[[PAGE ${s.page}]]\n${s.text}`).join("\n\n");

  const prompt = `Write a plain-spoken revision summary of the topic "${topic.title}" (chapter "${chapterTitle}") that a student can skim right before an exam.
Speak in plain words a smart 12-year-old would understand. Re-say each idea in your own simple words — never copy the material's textbook or legal phrasing. Keep every line short, one idea per line, no filler.
- "tldr": 2-3 short sentences — what this topic is about, in plain words.
- "keyPoints": the 4-8 most exam-important facts, each ONE short line (a phrase, not a full textbook sentence).
- "keyTerms": the essential terms the student must know (usually 6-10), each defined in ONE short plain sentence. Define each distinct term ONCE — don't split one idea's sub-parts into many entries (e.g. the canons of taxation are ONE term, not seven). A keyTerm defines a word; don't just restate a keyPoint.
- Cover every exam-important idea in the material; drop nothing important, but say each thing once, briefly.

Return ONLY this JSON:
{"tldr": string, "keyPoints": [string], "keyTerms": [{"term": string, "definition": string}]}

<UNTRUSTED_MATERIAL>
${material || "(no extracted material — summarize the standard fundamentals of this topic)"}
</UNTRUSTED_MATERIAL>`;

  return withQualityRetry({
    feature: "summary",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 120000,
    parse: (text) => summarySchema.parse(parseModelJson<Summary>(text)),
  });
}
