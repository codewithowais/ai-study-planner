import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// cross-spawn resolves .cmd/.exe shims and quotes args correctly on Windows,
// so `npm`, `claude`, and `codex` spawn identically on macOS/Linux/Windows.
import spawn from "cross-spawn";
import { runClaude } from "./providers/claude.mjs";
import { runCodex } from "./providers/codex.mjs";
import { normalizeFeature } from "./provider-utils.mjs";

/**
 * Local Companion Service.
 *
 * The ONLY component allowed to spawn an AI CLI child process. It binds to
 * 127.0.0.1 exclusively, requires a shared secret header on every request,
 * and accepts a fixed JSON request shape (never a shell string). This keeps
 * the browser and the Next server away from the shell, tokens, and env.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Minimal .env.local loader (no dependency on dotenv).
function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.COMPANION_PORT || 7788);
const SECRET = process.env.COMPANION_SECRET || "";
const HOST = "127.0.0.1";

if (!SECRET) {
  console.error("[companion] COMPANION_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const PROVIDERS = { claude: runClaude, codex: runCodex };

// CLI metadata: how to detect, install, and sign in to each provider.
// Install commands are FIXED here — never built from request input.
const CLI = {
  claude: {
    bin: "claude",
    label: "Claude Code CLI",
    package: "@anthropic-ai/claude-code",
    install: ["npm", "install", "-g", "@anthropic-ai/claude-code"],
    loginCommand: "claude",
    loginHint:
      "Run `claude` in a terminal, type /login, and sign in with your Claude subscription (Pro/Max) or API account. The CLI opens your browser to approve.",
  },
  codex: {
    bin: "codex",
    label: "Codex CLI",
    package: "@openai/codex",
    install: ["npm", "install", "-g", "@openai/codex"],
    loginCommand: "codex login",
    loginHint:
      "Run `codex login` in a terminal and sign in with your ChatGPT/OpenAI account. The CLI opens your browser to approve.",
  },
};

/** Run a command (arg array — no shell) with a timeout; capture output. */
function runCommand(cmd, args, timeoutMs = 240000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env } });
    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      resolve({ code: -1, stdout, stderr: stderr + "\n(timed out)", timedOut: true });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message, error: true });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Detect whether a provider CLI is installed and its version. */
async function detectProvider(name) {
  const meta = CLI[name];
  if (!meta) return { installed: false, version: null };
  const r = await runCommand(meta.bin, ["--version"], 10000);
  if (r.code === 0) {
    const version = (r.stdout || r.stderr).trim().split("\n")[0];
    return { installed: true, version };
  }
  // Present but not runnable (e.g. missing native binary) — keep the reason,
  // but only its first line: full stderr contains stack traces and local
  // filesystem paths that don't belong in an API response.
  const reason = (r.stderr || r.stdout || "").trim().split("\n")[0];
  return { installed: false, version: null, error: reason ? reason.slice(0, 200) : null };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limitBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Health check needs no auth.
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, providers: Object.keys(PROVIDERS) });
  }

  // Constant-ish secret check for everything else.
  const provided = req.headers["x-companion-secret"];
  if (!provided || provided !== SECRET) {
    return send(res, 401, { error: "Unauthorized companion request." });
  }

  if (req.method === "POST" && req.url === "/generate") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const provider = body.provider === "codex" ? "codex" : "claude";
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const system = typeof body.system === "string" ? body.system : undefined;
      const model =
        typeof body.model === "string" && body.model ? body.model : undefined;
      const timeoutMs =
        typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;
      const feature = normalizeFeature(body.feature);

      if (!prompt.trim()) {
        return send(res, 400, { error: "prompt is required." });
      }

      const run = PROVIDERS[provider];
      const result = await run({ system, prompt, model, timeoutMs });
      console.log(
        JSON.stringify({
          event: "ai_generation",
          provider,
          feature,
          model: result.model,
          durationMs: result.durationMs,
          costUsd: result.costUsd,
          usage: result.usage,
        })
      );
      return send(res, 200, result);
    } catch (err) {
      console.error("[companion] generate error:", err.message);
      return send(res, 502, { error: err.message || "AI request failed." });
    }
  }

  // Which CLIs are installed? Also report the Node/npm runtime the installer needs.
  if (req.method === "GET" && req.url === "/status") {
    const [claude, codex, npmv, nodev] = await Promise.all([
      detectProvider("claude"),
      detectProvider("codex"),
      runCommand("npm", ["--version"], 8000),
      runCommand("node", ["--version"], 8000),
    ]);
    return send(res, 200, {
      reachable: true,
      runtime: {
        npm: npmv.code === 0 ? npmv.stdout.trim().split("\n")[0] : null,
        node: nodev.code === 0 ? nodev.stdout.trim().split("\n")[0] : null,
      },
      providers: {
        claude: { ...claude, label: CLI.claude.label, package: CLI.claude.package },
        codex: { ...codex, label: CLI.codex.label, package: CLI.codex.package },
      },
    });
  }

  // Is the selected CLI signed in? (small probe request)
  if (req.method === "POST" && req.url === "/verify") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const provider = body.provider === "codex" ? "codex" : "claude";
      const detected = await detectProvider(provider);
      if (!detected.installed) {
        return send(res, 200, { authenticated: false, installed: false });
      }
      try {
        await PROVIDERS[provider]({
          prompt: "Reply with exactly: ok",
          timeoutMs: 60000,
        });
        return send(res, 200, { authenticated: true, installed: true });
      } catch (err) {
        return send(res, 200, {
          authenticated: false,
          installed: true,
          error: err.message,
        });
      }
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // Install a provider CLI (fixed command — request only picks which provider).
  if (req.method === "POST" && req.url === "/install") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const provider = body.provider === "codex" ? "codex" : "claude";
      const meta = CLI[provider];
      console.log(`[companion] installing ${meta.package} …`);
      const r = await runCommand(meta.install[0], meta.install.slice(1), 300000);
      const ok = r.code === 0;
      const detected = ok ? await detectProvider(provider) : { installed: false, error: null };
      return send(res, ok ? 200 : 502, {
        ok,
        installed: detected.installed,
        version: detected.version ?? null,
        error: detected.error ?? null,
        output: `${r.stdout}\n${r.stderr}`.trim().slice(-4000),
      });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // Guidance for signing in (interactive OAuth stays in the user's terminal).
  if (req.method === "POST" && req.url === "/login") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const provider = body.provider === "codex" ? "codex" : "claude";
      const meta = CLI[provider];
      return send(res, 200, { command: meta.loginCommand, hint: meta.loginHint });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  send(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`[companion] listening on http://${HOST}:${PORT}`);
  console.log(`[companion] providers: ${Object.keys(PROVIDERS).join(", ")}`);
});
