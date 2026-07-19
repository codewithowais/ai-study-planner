import type { Course, QuizQuestion } from "@/lib/types";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import { parseQuestionSet, toQuizQuestion } from "@/lib/quiz/question-quality";
import { getResource } from "@/lib/store/repositories";

const SYSTEM =
  "You are a warm tutor writing a mock exam that samples across a whole course, in plain " +
  "language a smart 12-year-old could follow. Explanations talk directly to the student and " +
  "teach WHY in short, plain sentences. Everything is grounded in the student's material. " +
  "Output ONLY valid JSON.";

/** Evenly sample up to `max` topics across the whole course. */
function sampleTopics(course: Course, max: number) {
  const all = course.subjects.flatMap((s) =>
    s.chapters.flatMap((c) => c.topics.map((t) => ({ topic: t, chapter: c.title })))
  );
  if (all.length <= max) return all;
  const step = all.length / max;
  const picked: typeof all = [];
  for (let i = 0; i < max; i++) picked.push(all[Math.floor(i * step)]);
  return picked;
}

export async function generateMockExam(
  course: Course,
  count: number,
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<QuizQuestion[]> {
  const topics = sampleTopics(course, Math.min(10, count));

  // Build a page->text map to attach short grounding snippets.
  const pageText = new Map<number, string>();
  for (const rid of course.resourceIds) {
    const r = await getResource(rid);
    if (!r) continue;
    for (const p of r.pages) if (!pageText.has(p.page)) pageText.set(p.page, p.text);
  }

  const context = topics
    .map((t) => {
      const page = t.topic.sources[0]?.page;
      const snippet = page ? (pageText.get(page) ?? "").slice(0, 700) : "";
      return `TOPIC: ${t.topic.title} (chapter: ${t.chapter})
Summary: ${t.topic.summary}
Source (p.${page ?? "?"}): ${snippet}`;
    })
    .join("\n\n");

  const prompt = `Create a mock exam of ${count} multiple-choice questions for the course "${course.title}".
Spread the questions across the topics listed below (roughly one or two per topic).
Each question: exactly 4 options, exactly one correct ("correctIndex" 0-based), an "explanation", and "sourcePage" when identifiable.
Use plausible distractors without trick wording — each wrong option must be a believable mistake a student could actually make (no filler or joke options, no "none of the above"). Each "explanation" is 1-3 short, plain sentences spoken straight to the student: WHY the right answer is right, then the ONE most tempting wrong answer named BY ITS IDEA (never "option A/B/C/D" — choices are reshuffled and the student never sees letters) and why it's wrong. Don't restate the question, don't quote long passages, and don't open with "The material states…" or "Module X explains…". Return exactly ${count} complete questions.

Return ONLY this JSON:
{"questions": [ {"prompt": string, "choices": [string, string, string, string], "correctIndex": number, "explanation": string, "sourcePage": number} ]}

<UNTRUSTED_MATERIAL>
${context}
</UNTRUSTED_MATERIAL>`;

  const parsed = await withQualityRetry({
    feature: "mock-exam",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 200000,
    parse: (text) => parseQuestionSet(parseModelJson(text), count),
  });

  return parsed.map(toQuizQuestion);
}
