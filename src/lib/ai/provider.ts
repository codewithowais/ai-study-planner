// Next-side client for the Local Companion Service.
// The Next server NEVER spawns a CLI itself — it always goes through the
// companion over localhost with the shared secret.
import { jsonrepair } from "jsonrepair";

export interface GenerateInput {
  prompt: string;
  system?: string;
  provider?: "claude" | "codex";
  model?: string;
  timeoutMs?: number;
  feature?: string;
}

export interface AiUsage {
  /** Total rendered input, including cached reads and cache writes. */
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  costUsd: number | null;
  durationMs: number | null;
  usage: AiUsage;
}

function companionUrl(): string {
  return process.env.COMPANION_URL || "http://127.0.0.1:7788";
}

export class CompanionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionError";
  }
}

export async function companionHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${companionUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const secret = process.env.COMPANION_SECRET;
  if (!secret) {
    throw new CompanionError(
      "COMPANION_SECRET is not configured. Add it to .env.local."
    );
  }

  const provider =
    input.provider || (process.env.AI_PROVIDER as "claude" | "codex") || "claude";
  const model = input.model || process.env.AI_MODEL || undefined;

  let res: Response;
  try {
    res = await fetch(`${companionUrl()}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-companion-secret": secret,
      },
      body: JSON.stringify({
        prompt: input.prompt,
        system: input.system,
        provider,
        model,
        timeoutMs: input.timeoutMs,
        feature: input.feature,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ? input.timeoutMs + 5000 : 300000),
    });
  } catch (err) {
    throw new CompanionError(
      "Could not reach the local companion service. Is it running? Start it with `npm run companion`."
    );
  }

  const data = (await res.json().catch(() => ({}))) as
    | GenerateResult
    | { error?: string };

  if (!res.ok) {
    throw new CompanionError(
      (data as { error?: string }).error || `AI request failed (${res.status}).`
    );
  }
  const result = data as GenerateResult;
  void logAiUsage(input.feature ?? "unknown", provider, result);
  return result;
}

/**
 * Append one line per AI call to data/ai-usage.jsonl so token spend per
 * feature is observable (fire-and-forget; never blocks or fails a request).
 * Local, single-user append-only log — rotate/delete freely.
 */
async function logAiUsage(
  feature: string,
  provider: string,
  result: GenerateResult
): Promise<void> {
  try {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      feature,
      provider,
      model: result.model,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
      ...(result.usage ?? {}),
    });
    await appendFile(path.join(dir, "ai-usage.jsonl"), line + "\n", "utf8");
  } catch {
    /* observability must never break generation */
  }
}

/**
 * Extract a JSON value from a model response that may wrap it in ```json
 * fences or surrounding prose. Tolerant of common LLM JSON slips (unescaped
 * newlines/quotes, trailing commas) via jsonrepair. Throws only if nothing
 * parseable can be recovered.
 */
export function parseModelJson<T>(text: string): T {
  const cleaned = text.trim();

  // Prefer a fenced code block if present.
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fence ? fence[1].trim() : cleaned;

  // Narrow to the outermost JSON span if there is surrounding prose.
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (start > 0 && end > start) candidate = candidate.slice(start, end + 1);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Repair common LLM JSON issues, then parse.
    try {
      return JSON.parse(jsonrepair(candidate)) as T;
    } catch {
      throw new CompanionError("The AI did not return valid JSON.");
    }
  }
}
