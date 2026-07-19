import spawn from "cross-spawn";
import crypto from "node:crypto";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  GUARD_SYSTEM_PROMPT,
  buildCodexArgs,
  parseCodexJsonl,
  safeProviderEnv,
} from "../provider-utils.mjs";

/**
 * Codex CLI provider (best-effort, secondary).
 *
 * Runs `codex exec` non-interactively in a sandbox directory, with sandbox
 * mode set to read-only so it cannot modify the machine. The prompt is passed
 * on STDIN. Requires the user to have authenticated the codex CLI separately.
 */

const SANDBOX = path.join(os.tmpdir(), "asp-companion-sandbox");
try {
  fs.mkdirSync(SANDBOX, { recursive: true });
} catch {
  /* ignore */
}

// Matches stderr from codex builds that reject one of our hardening config
// keys/flags (e.g. under --strict-config an unknown key hard-fails the call).
// Both words must appear together: a bare "unknown"/"unexpected" (auth errors,
// stream failures, unknown models) must NOT re-route the request through the
// un-hardened fallback spawn.
const CONFIG_REJECTED_RE =
  /(unknown|unexpected|unrecognized|invalid)\s+(config|option|argument|key|flag)/i;

/**
 * Content-addressed instructions file: identical guard+system content maps to
 * the same file, which is written once and reused across requests. No cleanup
 * is needed — the file count is bounded by the number of distinct system
 * prompts (~1-2KB each), and never deleting avoids both the same-millisecond
 * name-collision race and the delete-while-another-request-reads race that
 * per-request temp files had under the 4-way outline fan-out.
 */
function ensureInstructionsFile(instructions) {
  const hash = crypto
    .createHash("sha256")
    .update(instructions, "utf8")
    .digest("hex")
    .slice(0, 16);
  const file = path.join(SANDBOX, `codex-instructions-${hash}.txt`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, instructions, "utf8");
  }
  return file;
}

/**
 * Runs one codex spawn attempt. Resolves with {code, stdout, stderr} on
 * process close; rejects on launch failure or timeout. Every exit path goes
 * through settle(), which clears the timer and enforces settle-once.
 */
function spawnCodexOnce({ args, stdinText, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: SANDBOX,
      env: safeProviderEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;

    const settle = (outcome, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      outcome(value);
    };

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(reject, new Error("AI request timed out."));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      settle(reject, new Error(`Failed to launch codex CLI: ${err.message}`));
    });

    child.on("close", (code) => {
      settle(resolve, { code, stdout, stderr });
    });

    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

export async function runCodex({ system, prompt, model, timeoutMs = 240000 }) {
  const startedAt = Date.now();
  const instructions = `${GUARD_SYSTEM_PROMPT}${system ? `\n\n${system}` : ""}`;
  const instructionsFile = ensureInstructionsFile(instructions);

  // First attempt: full hardening (strict config, feature kill-switches,
  // instructions delivered via model_instructions_file).
  let attempt = await spawnCodexOnce({
    args: buildCodexArgs({ model, instructionsFile }),
    stdinText: prompt,
    timeoutMs,
  });

  // One-shot fallback: some codex builds reject the unverifiable config
  // keys/flags above (hard failure under --strict-config). Respawn once with
  // minimal safe args. model_instructions_file may be the rejected key, so
  // the guard+system text is prepended to the stdin prompt — guard delivery
  // must survive the fallback.
  if (attempt.code !== 0 && CONFIG_REJECTED_RE.test(attempt.stderr)) {
    attempt = await spawnCodexOnce({
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        ...(model ? ["--model", model] : []),
        "--json",
        "-",
      ],
      stdinText: `${instructions}\n\n${prompt}`,
      timeoutMs,
    });
  }

  if (attempt.code !== 0) {
    throw new Error(
      `codex CLI exited with code ${attempt.code}: ${attempt.stderr.slice(0, 500) || "no output"}`
    );
  }

  const parsed = parseCodexJsonl(attempt.stdout);
  return {
    ...parsed,
    model: model || "codex",
    costUsd: null,
    durationMs: Date.now() - startedAt,
  };
}
