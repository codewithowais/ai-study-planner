import { z } from "zod";
import { parseModelJson } from "@/lib/ai/provider";
import { withQualityRetry } from "@/lib/ai/quality";

// A short, personalized "study coach" note for the planner. Generated from the
// student's exam facts (days left, coverage done, pace) — cheap and cached by
// a coarse progress bucket so it refreshes as things change, not every load.
export const PLAN_COACH_PROMPT_VERSION = 1;

export const planCoachSchema = z.object({ note: z.string().trim().min(20) });
export type PlanCoach = z.infer<typeof planCoachSchema>;

const SYSTEM =
  "You are a warm, practical study coach talking straight to ONE student about " +
  "their exam prep. In 2-4 short, plain sentences give an encouraging, specific " +
  "game plan: where they stand, the ONE thing to focus on now, and a concrete " +
  "next step for today. Talk to them ('you'), no lists, no fluff. Be honest but " +
  "kind if they're behind. Output ONLY valid JSON — no prose, no markdown fences.";

export interface CoachFacts {
  courseTitle: string;
  examName: string;
  daysLeft: number;
  topicsLeft: number;
  totalInScope: number;
  readinessPct: number;
  perDay: number;
  pace: string;
  weakCount: number;
}

export async function generatePlanCoach(
  f: CoachFacts,
  opts: { provider?: "claude" | "codex"; model?: string } = {}
): Promise<PlanCoach> {
  const prompt = `The student is preparing for "${f.examName}" in the course "${f.courseTitle}".
Where they stand today:
- ${f.daysLeft} day(s) until the exam.
- ${f.topicsLeft} of ${f.totalInScope} topics in the exam's scope are still not done.
- Current readiness: ${f.readinessPct}%.
- ${f.weakCount} weak topic(s) flagged for review.
- Recommended pace: about ${f.perDay} topic(s) per day (pace looks "${f.pace}").

Write the coach note now — 2-4 short plain sentences, speaking directly to the student.

Return ONLY this JSON: {"note": string}`;

  return withQualityRetry({
    feature: "plan-coach",
    system: SYSTEM,
    prompt,
    provider: opts.provider,
    model: opts.model,
    timeoutMs: 60000,
    parse: (text) => planCoachSchema.parse(parseModelJson<PlanCoach>(text)),
  });
}
