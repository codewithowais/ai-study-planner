import spawn from "cross-spawn";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  GUARD_SYSTEM_PROMPT,
  buildClaudeArgs,
  normalizeClaudeEnvelope,
  safeProviderEnv,
} from "../provider-utils.mjs";

/**
 * Claude Code CLI provider.
 *
 * Runs `claude -p --output-format json` in a throwaway sandbox directory with
 * every file/exec/network tool disabled, so the tutor can only produce text —
 * it can never read the project, run shell commands, or reach the network.
 * The prompt is passed on STDIN (not argv), so large documents are safe.
 */

const SANDBOX = path.join(os.tmpdir(), "asp-companion-sandbox");
try {
  fs.mkdirSync(SANDBOX, { recursive: true });
} catch {
  /* ignore */
}

export function runClaude({ system, prompt, model, timeoutMs = 240000 }) {
  return new Promise((resolve, reject) => {
    const args = buildClaudeArgs({
      system,
      guard: GUARD_SYSTEM_PROMPT,
      model,
    });

    const child = spawn("claude", args, {
      cwd: SANDBOX,
      env: safeProviderEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("AI request timed out."));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to launch claude CLI: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `claude CLI exited with code ${code}: ${stderr.slice(0, 500) || "no output"}`
          )
        );
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          reject(new Error(envelope.result || "AI returned an error."));
          return;
        }
        resolve(normalizeClaudeEnvelope(envelope));
      } catch (err) {
        reject(
          new Error(
            `Could not parse claude CLI output: ${err.message}. Raw: ${stdout.slice(0, 300)}`
          )
        );
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
