import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import {
  getCourse,
  getTutorChat,
  updateTutorChat,
} from "@/lib/store/repositories";
import { gatherSourceText, locateTopic } from "@/lib/teach/context";
import { buildTutorPrompt, prepareTutorContext } from "@/lib/teach/chat-memory";
import { generate } from "@/lib/ai/provider";
import { ROMAN_URDU_CHAT_LINE } from "@/lib/teach/language";
import type { TutorChat, TutorChatMessage } from "@/lib/types";

const querySchema = z.object({ courseId: z.string(), topicId: z.string() });
const postSchema = querySchema.extend({
  message: z.string().trim().min(1).max(4000),
  language: z.enum(["en", "roman-ur"]).optional(),
});

const SYSTEM =
  "You are a warm, patient study tutor answering a student's follow-up question about ONE topic, " +
  "using their own uploaded material. Talk directly TO the student ('you', 'let's', 'notice how…') " +
  "like a kind teacher — never like a textbook. Speak simply, as if to a smart 12-year-old who is new " +
  "to this: short plain sentences, everyday words, one idea at a time. " +
  "Never copy the material's wording — re-explain each idea in your own simple voice. " +
  "The first time a technical or formal term comes up, say it once, then explain it in plain words " +
  "('this just means…') and give a quick real-life analogy ('it's like when you…'). " +
  "Always explain the WHY, not just the what. " +
  "Ground your answer in the student's material (given as data inside <UNTRUSTED_MATERIAL>). " +
  "Cite the source file and page like (FIN623.pdf, p.12) when you use it. " +
  "If the material doesn't cover the question, say so plainly, then give clearly labeled standard guidance. " +
  "Match your length to the question: a quick factual question gets 1-3 sentences; a 'why' or 'how' " +
  "question gets a short, clear explanation. Go longer only if the student asks, or if the idea truly " +
  "needs it. Be encouraging, never pad. Respond in plain text.";

export const runtime = "nodejs";
export const maxDuration = 120;

// Keep persisted chat history bounded; only the most recent messages survive.
const MAX_STORED_MESSAGES = 400;

/**
 * Merge concurrently stored messages with this request's new exchange.
 * The AI call spans ~90s, so another request may have saved messages since we
 * read the chat; a blind overwrite would drop that exchange. Union by id and
 * sort by createdAt (stable sort preserves insertion order for equal
 * timestamps, keeping a user message before its assistant reply).
 */
function mergeMessages(
  stored: TutorChatMessage[],
  incoming: TutorChatMessage[]
): TutorChatMessage[] {
  const seen = new Set<string>();
  const merged: TutorChatMessage[] = [];
  for (const message of [...stored, ...incoming]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  merged.sort((left, right) =>
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0
  );
  return merged.slice(-MAX_STORED_MESSAGES);
}

async function locateOwnedTopic(userId: string, courseId: string, topicId: string) {
  const course = await getCourse(courseId);
  if (!course || course.userId !== userId) return null;
  const location = locateTopic(course, topicId);
  return location ? { course, location } : null;
}

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const input = querySchema.parse({
    courseId: url.searchParams.get("courseId"),
    topicId: url.searchParams.get("topicId"),
  });
  const owned = await locateOwnedTopic(user.id, input.courseId, input.topicId);
  if (!owned) return fail("Topic not found.", 404);

  const chat = await getTutorChat(input.courseId, input.topicId);
  if (chat && chat.userId !== user.id) return fail("Topic not found.", 404);
  return ok({ messages: chat?.messages ?? [] });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, topicId, message, language } = postSchema.parse(await req.json());
  const owned = await locateOwnedTopic(user.id, courseId, topicId);
  if (!owned) return fail("Topic not found.", 404);
  const { course, location } = owned;

  const existing = await getTutorChat(courseId, topicId);
  if (existing && existing.userId !== user.id) return fail("Topic not found.", 404);

  const now = new Date().toISOString();
  const userMessage: TutorChatMessage = {
    id: nanoid(10),
    role: "user",
    content: message,
    createdAt: now,
  };
  const history = [...(existing?.messages ?? []), userMessage];
  const context = prepareTutorContext(history);

  const sources = await gatherSourceText(course, location.topic, 10_000);
  const material = sources
    .map((source) => `[[${source.file} - PAGE ${source.page}]]\n${source.text}`)
    .join("\n\n");
  const prompt = buildTutorPrompt({
    topicTitle: location.topic.title,
    chapterTitle: location.chapterTitle,
    material,
    compactMemory: context.compactMemory,
    recentTranscript: context.recentTranscript,
  });

  const { text } = await generate({
    system: language === "roman-ur" ? `${SYSTEM} ${ROMAN_URDU_CHAT_LINE}` : SYSTEM,
    prompt,
    provider: user.settings.provider,
    model: user.settings.model,
    timeoutMs: 90_000,
    feature: "tutor-chat",
  });

  const assistantMessage: TutorChatMessage = {
    id: nanoid(10),
    role: "assistant",
    content: text,
    createdAt: new Date().toISOString(),
  };
  // Atomic merge under the store's per-file lock: `mutate` sees the truly
  // latest stored chat even when a concurrent send saved during our ~90s AI
  // call, so concurrent sends are additive with no lost-update window.
  await updateTutorChat(courseId, topicId, (latest) => {
    const stored =
      latest && latest.userId === user.id
        ? latest.messages
        : existing?.messages ?? [];
    return {
      userId: user.id,
      courseId,
      topicId,
      messages: mergeMessages(stored, [userMessage, assistantMessage]),
      // Stored compactMemory trails by one turn (computed pre-reply) and is informational only.
      compactMemory: context.compactMemory,
      createdAt: latest?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: assistantMessage.createdAt,
    };
  });

  return ok({ reply: text, messages: [userMessage, assistantMessage] });
});
