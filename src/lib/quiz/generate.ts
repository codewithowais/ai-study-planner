import type { QuizQuestion, Topic } from "@/lib/types";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import { parseQuestionSet, toQuizQuestion } from "@/lib/quiz/question-quality";

const SYSTEM =
  "You are a warm tutor writing quiz questions for ONE student, in plain language a " +
  "smart 12-year-old could follow. Questions are fair, unambiguous, and test ONE topic. " +
  "Explanations talk directly to the student and teach WHY in short, plain, encouraging " +
  "sentences — no jargon dumps, no textbook register. Everything is grounded in the " +
  "student's material. You output ONLY valid JSON — no prose, no markdown fences.";

export async function generateQuiz(
  params: {
    topic: Topic;
    chapterTitle: string;
    courseTitle: string;
    sources: { page: number; text: string }[];
    count?: number;
    focusPrompts?: string[];
  },
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<QuizQuestion[]> {
  const { topic, chapterTitle, courseTitle, sources, count = 5, focusPrompts } = params;
  const material = sources.map((s) => `[[PAGE ${s.page}]]\n${s.text}`).join("\n\n");

  const focusLine =
    focusPrompts && focusPrompts.length
      ? `\nTHIS IS A TARGETED RE-QUIZ. The student previously struggled with these areas — prioritise testing them (with fresh, differently-worded questions, not copies):\n${focusPrompts
          .slice(0, 8)
          .map((p) => `- ${p}`)
          .join("\n")}\n`
      : "";

  const prompt = `Write ${count} multiple-choice questions to test understanding of the topic "${topic.title}" (chapter "${chapterTitle}", course "${courseTitle}").
${focusLine}
Requirements:
- Each question has exactly 4 options.
- Exactly one option is correct; "correctIndex" is its 0-based index.
- Mix difficulty: some recall, some short real-world application scenarios.
- Ask each question in plain, direct language — don't pad the stem with "According to the material…" or "As introduced in Module 1…".
- Use plausible distractors: every wrong option is a believable mistake a student could make (a real misconception, a swapped definition, a close-but-wrong number). No filler or joke options and no "none of the above"; never trick wording or multiple defensible answers.
- "explanation": 1-3 short, plain sentences spoken straight to the student. First, WHY the right answer is right in everyday words. Then name the ONE most tempting wrong answer BY ITS IDEA (e.g. "the 'monetary policy' choice") and say why it's wrong — NEVER by letter or position ("option A/B/C/D"), because the choices are reshuffled and the student never sees letters.
- In "explanation", don't repeat the question or quote long passages — the student already sees the question and the choice marked correct. Just give the reasoning in plain words.
- "sourcePage": the page number the question is based on, when identifiable.
- Base questions on the material below; do not ask about anything not supported by it.
- Return exactly ${count} complete questions; never omit questions to save tokens.

Return ONLY this JSON:
{"questions": [ {"prompt": string, "choices": [string, string, string, string], "correctIndex": number, "explanation": string, "sourcePage": number} ]}

<UNTRUSTED_MATERIAL>
${material || "(no extracted material — write standard fundamental questions for this topic)"}
</UNTRUSTED_MATERIAL>`;

  const parsed = await withQualityRetry({
    feature: "quiz",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 150000,
    parse: (text) => parseQuestionSet(parseModelJson(text), count),
  });

  return parsed.map(toQuizQuestion);
}
