import { generate } from "./provider.ts";

export class AiQualityError extends Error {
  constructor(feature: string, options?: ErrorOptions) {
    super(
      `The AI returned an incomplete ${feature} response twice. Please retry.`,
      options
    );
    this.name = "AiQualityError";
  }
}

interface QualityRetryInput<T> {
  feature: string;
  system: string;
  prompt: string;
  provider?: "claude" | "codex";
  model?: string;
  timeoutMs?: number;
  parse: (text: string) => T;
  /**
   * Test-only override for the raw model call. Production callers never pass
   * this — withQualityRetry calls generate() itself.
   */
  runText?: (input: { prompt: string; feature: string }) => Promise<string>;
}

const REPAIR_INSTRUCTION = `<QUALITY_REPAIR>
Your previous response was incomplete or failed the required output structure.
Regenerate the entire answer at full teaching quality.
- Cover every requested topic and subtopic.
- Preserve source grounding and citations.
- Include all requested explanations, examples, and exam guidance.
- Follow the requested JSON structure exactly.
- Do not shorten the response to save tokens.
</QUALITY_REPAIR>`;

/** Retry once only when parsing or quality validation rejects model output. */
export async function withQualityRetry<T>({
  feature,
  system,
  prompt,
  provider,
  model,
  timeoutMs,
  parse,
  runText,
}: QualityRetryInput<T>): Promise<T> {
  const run =
    runText ??
    (async (attempt: { prompt: string; feature: string }) =>
      (
        await generate({
          system,
          prompt: attempt.prompt,
          provider,
          model,
          timeoutMs,
          feature: attempt.feature,
        })
      ).text);

  const firstText = await run({ prompt, feature });
  try {
    return parse(firstText);
  } catch (firstError) {
    const retryText = await run({
      prompt: `${prompt}\n\n${REPAIR_INSTRUCTION}`,
      feature: `${feature}-retry`,
    });
    try {
      return parse(retryText);
    } catch (retryError) {
      throw new AiQualityError(feature, { cause: retryError ?? firstError });
    }
  }
}
