import type { Topic } from "@/lib/types";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";
import {
  lessonSchema,
  requiredExerciseLabels,
  missingExerciseLabels,
  deriveCitations,
  type Lesson,
} from "@/lib/teach/content-quality";

export { lessonSchema };
export type { Lesson };
export { requiredExerciseLabels, missingExerciseLabels };
export const LESSON_PROMPT_VERSION = 9;

const SYSTEM =
  "You are a warm, patient personal tutor sitting next to ONE student, teaching " +
  "ONE topic from their own uploaded material. Talk directly TO the student " +
  "('you', 'let's', 'notice how...') the way a kind teacher explains things out " +
  "loud — never like a textbook. " +
  "SPEAK VERY SIMPLY, as if to a smart 12-year-old who is new to this subject: " +
  "use short, plain sentences (mostly under 20 words), common everyday words, and " +
  "one idea at a time. Avoid academic or legal phrasing; if the material uses a " +
  "hard word, say it once, then immediately explain it in plain words ('this just " +
  "means…') and give a quick real-life example or analogy ('it's like when you…'). " +
  "Never chain jargon together. Build up from the simplest idea to the harder ones. " +
  "Be encouraging ('don't worry, this is easier than it looks'), but never pad with fluff. " +
  "Never copy the material's wording — re-teach every idea in your own simple voice. " +
  "The student's material is the source of truth: cover EVERYTHING it says about " +
  "this topic and never silently skip or compress away content. When the material " +
  "is thin, you may teach standard fundamentals, but keep them consistent with the " +
  "source and never claim they came from it. " +
  "Completeness, correctness, and clear beginner understanding take priority over brevity. " +
  "You output ONLY valid JSON — no prose, no markdown fences.";

export async function generateLesson(
  params: {
    topic: Topic;
    chapterTitle: string;
    courseTitle: string;
    level: "beginner" | "intermediate" | "advanced";
    sources: { page: number; text: string }[];
    depth?: "simpler" | "deeper";
    /**
     * Pages cited ONLY by this topic. Numbered exercises on these pages are
     * hard-required in the lesson; items on pages shared with other topics
     * are encouraged by the prompt but never cause a rejection (they belong
     * to the neighbouring topics' lessons).
     */
    exclusivePages?: number[];
  },
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<Lesson> {
  const { topic, chapterTitle, courseTitle, level, sources, depth, exclusivePages } =
    params;

  const material = sources
    .map((s) => `[[PAGE ${s.page}]]\n${s.text}`)
    .join("\n\n");

  const subtopicLine = topic.subtopics.length
    ? `Make sure you cover each of these subtopics: ${topic.subtopics.join("; ")}.`
    : "";

  // Compute the numbered items this topic owns ONCE. Injecting the exact list
  // up front makes the first draft cover them (far fewer expensive coverage
  // retries), and the same list is the deterministic gate below.
  const requiredPages = new Set(exclusivePages ?? topic.sources.map((s) => s.page));
  const requiredItems = requiredExerciseLabels(
    sources.filter((s) => requiredPages.has(s.page))
  );
  const exerciseLine = requiredItems.length
    ? `The pages for this topic contain these NUMBERED items. You MUST address every one of them by its exact number (solve each exercise step by step): ${requiredItems
        .map((r) => `${r.kind} ${r.number}`)
        .join(", ")}.`
    : "";

  const depthLine =
    depth === "simpler"
      ? "IMPORTANT: Explain this in the SIMPLEST possible way — as if to a curious 12-year-old. Use short sentences, plain words, and everyday analogies. Avoid jargon; when a technical term is unavoidable, define it immediately."
      : depth === "deeper"
        ? "IMPORTANT: Go DEEPER than a basic overview — add rigor, nuance, edge cases, and the 'why' behind the rules for a student who already grasps the basics. Still stay grounded in the material."
        : "";

  const prompt = `Teach the topic "${topic.title}" from the chapter "${chapterTitle}" of the course "${courseTitle}".
The student's self-assessed level is: ${level}. Pitch explanations accordingly, but always start from the fundamentals so a beginner can follow.
${depthLine}
${subtopicLine}
${exerciseLine}

Write a complete mini-lesson, speaking directly to the student like a friendly teacher:
- "intro": 1-2 warm sentences on why this topic matters to THEM ("By the end of this you'll be able to..."), then get straight into teaching — don't pad it.
- "sections": teach the topic step by step, talking the student through it ("Let's start with...", "Now here's the part people find confusing — don't worry, we'll take it slowly", "Notice how..."). Each section has a "heading" phrased as a plain question or idea in the student's OWN words (e.g. "Why some expenses get added back" — never lead a heading with a law/section/code number), "content" (plain conversational explanation; you may use short bullet lines starting with "- "), and "pages" (the source page numbers that back this section). Your FINAL section MUST be titled "In a nutshell" — 2-3 plain sentences that recap the big ideas and deliver on the "by the end you'll be able to…" promise from your intro; no new content and no re-crunching numbers.
- "keyDefinitions": every important term, each in ONE short plain sentence a beginner could repeat from memory.
- "examples": 1-3 FRESH everyday illustrations or a NEW practice case — never a repeat of an exercise you already solved in a section. Add a second or third ONLY when it shows a genuinely new angle, not to pad. Walk each through step by step ("First we..., then we..., and that gives us...").
- "examTips": short, punchy reminders — each names one common mistake and its fix in a single line ("Students mix up X and Y — remember Z"), WITHOUT re-explaining the concept.
- "selfCheck": 2-3 short questions that let the student test whether they really GOT it, each with a one-line answer to reveal after trying. Make them think ("Why is X treated as Y?"), not just recall a word. Keep both the question and the answer short.
- "visuals": add 1-2 diagrams when one makes the idea clearer than words alone — built ONLY from what you already taught above (no new facts). Use the type that fits: a multi-step CALCULATION should get a "calc" ladder; two or three things students mix up should get a "compare" table; a process or decision sequence should get a "flow"; dated events should get a "timeline". Skip visuals ONLY for a purely descriptive topic with nothing to lay out (an empty list is fine) — but don't skip when one of these clearly fits. Each item is ONE of:
  - {"type":"flow","title":...,"steps":[{"label":...,"note":optional}]} — a process or decision sequence (2-7 steps)
  - {"type":"compare","title":...,"columns":[2-3 short headers],"rows":[{"label":...,"cells":[one per column]}]} — two or three things students mix up
  - {"type":"timeline","title":...,"events":[{"when":...,"what":...}]} — events in order
  - {"type":"calc","title":...,"steps":[{"label":...,"value":...,"note":optional}]} — a multi-step calculation laid out as a running ladder

Put the correct source page number(s) in each section's "pages" — that is how the lesson stays grounded (you do NOT need to write a separate citations list; it is built from your section pages).

COVERAGE CONTRACT — the student will never read the handouts themselves, so your lesson must carry everything:
- Walk through EVERY heading, concept, definition, note, rule, list, and table that the material contains for this topic. Nothing gets skipped or waved away.
- Explicitly teach every listed subtopic; never silently omit one.
- If the material includes an exercise, practice question, review question, or MCQ for this topic, do not skip it: restate what it asks in plain words, invite the student to pause and try it themselves first, then solve it step by step INSIDE A SECTION, explain WHY the answer is right, and mention the mistake students usually make on it. Solve each numbered item EXACTLY ONCE — never re-solve the same exercise again under "examples".
- When the material NUMBERS its exercises/examples (e.g. "Exercise 1", "Exercise - 5", "Example 8.36"), refer to each one BY ITS EXACT NUMBER and solve every single one — a lesson that skips a numbered exercise is incomplete and will be rejected.
- If the material describes a table or figure, explain in words what it shows, row by row or part by part, and what the student should notice.
- Do not shorten or simplify away important content merely to save tokens.

Teaching style (write for a beginner who finds this subject hard):
- The first time any technical or formal term appears, say it once, then explain it in plain words ("in simple terms, this means…") and give a quick real-life analogy ("this works just like…").
- Introduce every number, name, or figure BEFORE you use it — never let a value appear from nowhere. Say where it comes from ("the salary of 525,000 we were given above").
- Call each thing by ONE consistent name the whole way through — don't switch between "the company", "the panel", and "the corporation" for the same thing.
- When a step seems to contradict what you just said, add one short bridging sentence explaining why ("this looks backwards, but here's why we add it back…").
- Explain both what each idea means AND why it matters, in everyday language.
- Prefer a concrete everyday example over an abstract definition wherever possible.

Ground everything in the material below. If the material is thin, teach the standard fundamentals of the topic but keep it consistent with the material.

Return ONLY this JSON:
{"intro": string, "sections": [{"heading": string, "content": string, "pages": [number]}], "keyDefinitions": [{"term": string, "definition": string}], "examples": [{"title": string, "content": string}], "examTips": [string], "selfCheck": [{"question": string, "answer": string}], "visuals": [{"type": "flow|compare|timeline|calc", "title": string, "steps|columns+rows|events": "see the visuals options above"}]}

<UNTRUSTED_MATERIAL>
${material || "(No extracted text was available for this topic — teach the standard fundamentals.)"}
</UNTRUSTED_MATERIAL>`;

  return withQualityRetry({
    feature: "lesson",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 180000,
    parse: (text) => {
      const lesson = lessonSchema.parse(parseModelJson<Lesson>(text));
      const minimumSections = Math.min(
        2,
        Math.max(1, topic.subtopics.length)
      );
      const teachingLength = lesson.sections.reduce(
        (total, section) => total + section.content.length,
        0
      );
      if (lesson.sections.length < minimumSections || teachingLength < 250) {
        throw new Error("Lesson does not teach the topic in enough depth.");
      }
      // Deterministic no-skip enforcement (reuses the up-front list): every
      // numbered exercise/example on pages this topic owns must be addressed
      // by number. Pages shared with other topics never force coverage.
      const missing = missingExerciseLabels(lesson, requiredItems);
      if (missing.length > 0) {
        throw new Error(
          `Lesson skipped numbered items from the material: ${missing.join(", ")}. ` +
            "Every numbered exercise/example must be solved by its exact number."
        );
      }
      // Citations are DERIVED from the pages the model grounded each section
      // in — real source snippets (more accurate than model-written ones) and
      // no extra output tokens spent regenerating them.
      if (sources.length > 0) {
        lesson.citations = deriveCitations(lesson, sources);
      }
      return lesson;
    },
  });
}
