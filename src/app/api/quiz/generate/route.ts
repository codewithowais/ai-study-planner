import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  getCourse,
  getProgress,
  getQuizSet,
  saveQuizSet,
  savePendingQuiz,
} from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import { generateQuiz, QUIZ_PROMPT_VERSION } from "@/lib/quiz/generate";
import { getOrGenerateCached } from "@/lib/ai/cache-key";
import { languageVariant, languageFingerprint } from "@/lib/teach/language";
import type { QuizQuestion } from "@/lib/types";
import type { PendingQuiz } from "@/lib/quiz/scoring";

const schema = z.object({
  courseId: z.string(),
  topicId: z.string(),
  count: z.number().int().min(3).max(10).optional(),
  regenerate: z.boolean().optional(),
  language: z.enum(["en", "roman-ur"]).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 200;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, count, regenerate, language } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);
  const loc = locateTopic(course, topicId);
  if (!loc) return fail("Topic not found.", 404);

  // Auto-target the re-quiz on what the student missed if the topic is weak.
  const progress = await getProgress(courseId);
  const entry = progress?.topics[topicId];
  const focusPrompts =
    entry?.status === "weak" ? entry.lastWrongPrompts : undefined;
  const hasFocus = !!focusPrompts && focusPrompts.length > 0;

  const generateFresh = async () => {
    const sources = await gatherSourceText(course, loc.topic);
    return generateQuiz(
      {
        topic: loc.topic,
        chapterTitle: loc.chapterTitle,
        courseTitle: course.title,
        sources,
        count: count ?? 5,
        focusPrompts,
        language,
      },
      { provider: user.settings.provider, model: user.settings.model }
    );
  };

  const variant = languageVariant(language);

  // A weak-topic targeted re-quiz is attempt-specific — always fresh, never
  // cached (it would poison the topic's canonical set). Otherwise serve the
  // cached set on open, and regenerate only on an explicit "Retake".
  const questions = hasFocus
    ? await generateFresh()
    : await getOrGenerateCached<QuizQuestion[]>({
        fingerprintInput: {
          feature: "quiz",
          promptVersion: QUIZ_PROMPT_VERSION,
          provider: user.settings.provider,
          model: user.settings.model ?? process.env.AI_MODEL ?? "default",
          courseTitle: course.title,
          chapterTitle: loc.chapterTitle,
          topic: loc.topic,
          count: count ?? 5,
          // undefined for English → identical hash to before (no re-billing);
          // "roman-ur" → distinct fingerprint + its own generation lock.
          language: languageFingerprint(language),
        },
        read: () => (regenerate ? null : getQuizSet<unknown>(courseId, topicId, variant)),
        save: (cache) => saveQuizSet(courseId, topicId, cache, variant),
        generate: generateFresh,
        isStale: (qs) => qs.length === 0,
        acceptLegacy: false,
      });

  if (questions.length === 0) {
    return fail("Could not generate a quiz for this topic. Please try again.", 502);
  }

  const attemptId = nanoid();
  const pending: PendingQuiz = {
    attemptId,
    userId: user.id,
    courseId,
    topicId,
    kind: "topic",
    createdAt: new Date().toISOString(),
    questions,
  };
  await savePendingQuiz(attemptId, pending);

  const nextTopicId =
    loc.index < loc.order.length - 1 ? loc.order[loc.index + 1] : null;

  // Never send correct answers to the client.
  return ok({
    attemptId,
    topicTitle: loc.topic.title,
    nextTopicId,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
    })),
  });
});
