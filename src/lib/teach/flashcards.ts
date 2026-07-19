import type { Topic } from "@/lib/types";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import {
  flashcardsSchema,
  type Flashcards,
} from "@/lib/teach/content-quality";

export { flashcardsSchema };
export type { Flashcards };
export const FLASHCARDS_PROMPT_VERSION = 3;

const SYSTEM =
  "You create active-recall flashcards from a student's own material. Cards force recall, not " +
  "recognition, and answers are plain and one sentence. Output ONLY valid JSON — no prose, no markdown fences.";

export async function generateFlashcards(
  params: { topic: Topic; chapterTitle: string; sources: { page: number; text: string }[] },
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<Flashcards> {
  const { topic, chapterTitle, sources } = params;
  const material = sources.map((s) => `[[PAGE ${s.page}]]\n${s.text}`).join("\n\n");

  const prompt = `Create 6-10 active-recall flashcards for the topic "${topic.title}" (chapter "${chapterTitle}").
Each card: "front" is a short prompt that forces recall (e.g. "Name the canons of taxation"); "back" is the correct answer in plain words.
- Prefer recall prompts over "define X" where possible.
- Write each "back" as ONE short sentence a student could say out loud — plain words, not copied textbook or legal phrasing. Keep the exam-critical term or number; drop the padding.
- Cover the topic broadly rather than repeating one narrow fact.
- Make every prompt distinct, unambiguous, and answerable from one best response.
- Base everything on the material below.

Return ONLY this JSON: {"cards": [{"front": string, "back": string}]}

<UNTRUSTED_MATERIAL>
${material || "(no extracted material — make standard fundamental flashcards for this topic)"}
</UNTRUSTED_MATERIAL>`;

  return withQualityRetry({
    feature: "flashcards",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 120000,
    parse: (text) => flashcardsSchema.parse(parseModelJson<Flashcards>(text)),
  });
}
