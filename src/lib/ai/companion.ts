// Server-side helpers that call the companion's management endpoints
// (status / verify / install / login). Always via localhost + shared secret.
import { CompanionError } from "@/lib/ai/provider";

function companionUrl(): string {
  return process.env.COMPANION_URL || "http://127.0.0.1:7788";
}

async function call<T>(
  pathname: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const secret = process.env.COMPANION_SECRET;
  if (!secret) throw new CompanionError("COMPANION_SECRET is not configured.");
  const res = await fetch(`${companionUrl()}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-companion-secret": secret,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CompanionError((data as { error?: string }).error || `Request failed (${res.status}).`);
  }
  return data as T;
}

export interface ProviderStatus {
  installed: boolean;
  version: string | null;
  label: string;
  package: string;
}

export interface CompanionStatus {
  reachable: boolean;
  /** Node/npm the installer needs. null = not found on the companion's PATH. */
  runtime?: { node: string | null; npm: string | null };
  providers: { claude: ProviderStatus; codex: ProviderStatus };
}

export async function companionStatus(): Promise<CompanionStatus> {
  try {
    return await call<CompanionStatus>("/status");
  } catch {
    return {
      reachable: false,
      runtime: { node: null, npm: null },
      providers: {
        claude: { installed: false, version: null, label: "Claude Code CLI", package: "@anthropic-ai/claude-code" },
        codex: { installed: false, version: null, label: "Codex CLI", package: "@openai/codex" },
      },
    };
  }
}

export function companionVerify(provider: "claude" | "codex") {
  return call<{ authenticated: boolean; installed: boolean; error?: string }>("/verify", {
    method: "POST",
    body: JSON.stringify({ provider }),
    timeoutMs: 70000,
  });
}

export function companionInstall(provider: "claude" | "codex") {
  return call<{
    ok: boolean;
    installed: boolean;
    version: string | null;
    error: string | null;
    output: string;
  }>("/install", { method: "POST", body: JSON.stringify({ provider }), timeoutMs: 310000 });
}

export function companionLoginInfo(provider: "claude" | "codex") {
  return call<{ command: string; hint: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}
