# AI Study Partner / Personal Tutor

Upload your study material (PDF / notes / past papers) and get a structured
course you can learn topic-by-topic with an AI tutor grounded in **your own
material** — with quizzes, weak-topic revision, mock exams, and progress
tracking. Everything runs locally against your own AI CLI.

## How it works

```
Browser (Next.js UI)
      │  same-origin HTTP
      ▼
Next.js API routes ── JSON file store (./data)   ← users, courses, progress, lessons
      │  localhost + shared secret
      ▼
Local Companion Service (companion/server.mjs, 127.0.0.1:7788)
      │  spawns a child process (fixed JSON request shape — never a shell string)
      ▼
`claude` CLI  (default)   /   `codex` CLI   ← swappable AiProvider
```

- **The browser and the Next server never spawn a CLI.** Only the companion
  service does, and only via `child_process` with an argument array — no shell,
  no token/env exposure. It binds to `127.0.0.1` only and requires a shared
  secret header on every request.
- **Uploaded documents are untrusted.** Their text is passed to the model
  wrapped in `<UNTRUSTED_MATERIAL>` delimiters with a system instruction that
  content inside is data to teach from — never instructions to follow. The
  tutor CLI also runs with all file/exec/network tools disabled, in a throwaway
  sandbox directory.
- **Provider is modular.** `companion/providers/*.mjs` implement `claude` and
  `codex`; an official-API provider can be added later without touching the app.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui (Radix) ·
JSON file store · `pdfjs-dist` for PDF text extraction · `jsonrepair` for
tolerant LLM-JSON parsing.

## Prerequisites

- **Node.js 18.17+** (Next.js requirement).
- A working local AI CLI: [`claude`](https://claude.com/claude-code) (default)
  or `codex` — or install/sign in right from the app's **AI settings** page.

### Cross-platform (macOS / Linux / Windows)

Works on all three. The companion spawns the CLIs through
[`cross-spawn`](https://www.npmjs.com/package/cross-spawn), so Windows `.cmd`
shims (`npm.cmd`, `claude.cmd`) and argument quoting are handled correctly —
the **Install** and **Sign in** buttons in AI settings work on Windows too.
PDF extraction resolves its worker via a `file://` URL so it loads on Windows
paths. On Windows, run the two commands in separate PowerShell/CMD windows
(`npm run companion` and `npm run dev`) or use `npm run dev:all`.

## Setup

```bash
npm install
cp .env.example .env.local
# then edit .env.local and set COMPANION_SECRET to a long random string:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Run (local development)

Run the web app and the companion service together:

```bash
npm run dev:all
```

Or run them in separate terminals:

```bash
npm run companion   # terminal 1 — the AI bridge on :7788
npm run dev         # terminal 2 — the Next.js app on :3000
```

Open http://localhost:3000, create your (single, local) account, and upload a
PDF.

## Signing in

This is a **single-user, local** app. There is **no shared/default login** — and
none is stored in this repo on purpose: passwords are hashed with bcrypt, and
your account data lives only in `data/` (which is git-ignored), so a fresh clone
starts empty.

- **First run:** open http://localhost:3000/login and **register** — the first
  sign-up creates your account (name, email, password). Your email is just a
  local login; it is never sent anywhere.
- **Returning:** sign in with the email + password you chose.
- **Forgot your password?** Reset it locally — you type a new one, it is hashed
  on your machine, nothing is shared:

  ```bash
  npm run reset-password           # resets the only account
  npm run reset-password you@x.com # or target a specific email
  ```

  Then sign in with the new password.

> Your credentials, study progress, chats, and uploaded PDFs never leave your
> machine and are never committed to the repo.

## Run with Docker

The **web app** runs in Docker; the **companion service stays on the host**
because it needs your host's `claude`/`codex` CLI and credentials (which never
enter the container). The container reaches the host companion via
`host.docker.internal`.

```bash
# 1) start the companion on the host
npm run companion

# 2) build & run the web app in Docker (reads COMPANION_SECRET from .env.local)
export $(grep -v '^#' .env.local | xargs)
docker compose up --build
```

App: http://localhost:3000 · data persists in `./data`.

## Connecting your AI (from the UI)

**AI settings** shows a live connection panel with three checks and one-click fixes:

1. **Local companion service** — running or not (`npm run companion`).
2. **CLI installed** — if missing, an **Install** button runs the official
   `npm install -g` for the selected provider (`@anthropic-ai/claude-code` or
   `@openai/codex`) via the companion.
3. **Signed in** — **Test connection** runs a tiny probe to confirm auth; if
   you're not signed in, **Sign in** shows the exact command to run. The actual
   subscription login is your provider's own secure browser OAuth — the app
   launches/guides it and detects success but never handles your password.

A banner appears across the app whenever the companion is down or the active
CLI isn't installed, linking straight to settings.

## The learning flow

1. **Upload** a PDF/notes/past paper.
2. The system **extracts** text per page and **generates a course outline**
   (subjects → chapters → topics → subtopics) via a map-reduce over page
   batches, with a coverage check so nothing is silently skipped.
3. **Pick a topic** (or "Learn step-by-step").
4. The tutor **teaches** it from the ground up — definitions, examples,
   exam-important points — with **citations back to your source pages**.
5. **Take a quiz**; answers are graded server-side.
6. **Weak topics** are surfaced in Progress + Revision and can be re-taught /
   re-quizzed.
7. **Progress is saved** to the JSON store; **resume** any time.
8. **Mock exams** sample questions across the whole course.

## A more natural lesson voice

The **⚙ menu** next to "Listen" on any lesson lets you choose a voice engine:

- **Natural — lifelike (beta):** a small neural voice that runs **on your
  device** in the browser (via WebAssembly). It sounds far more human than the
  built-in voices. The first play downloads a ~60MB voice model once (from
  HuggingFace) and caches it; after that it works offline. **Your lesson text
  never leaves your machine** — synthesis is local. Trade-off: the first
  download takes a moment and synthesis uses your CPU, so it's a touch slower
  to start than the built-in voice.
- **Built-in — instant:** your browser's own speech (no download). How human it
  sounds depends on the voices the browser exposes; the Web Speech API has no
  emotion/tone control, only speed and voice. The app auto-selects the most
  natural one and hides the robotic "novelty" voices.

To make the **built-in** engine sound better (free, fully offline):

- **macOS:** System Settings › Accessibility › Spoken Content › System Voice ›
  *Manage Voices*, and download a voice marked **(Enhanced)** or **(Premium)**
  (e.g. Ava, Zoe, Samantha). Then open the app in **Safari** and pick it.
- **Windows:** open the app in **Microsoft Edge** — its "Online (Natural)"
  voices sound far more human and appear automatically.

(A *cloud* neural voice with explicit tone control — e.g. a "warm, confident
tutor" instruction — would sound the most expressive, but is intentionally not
built in: it needs an API key and would send lesson text off your machine.)

## Data & privacy

All data lives in `./data` (git-ignored): `users.json`, `sessions.json`,
`courses/`, `resources/`, `progress/`, `lessons/`, `quizzes/`. Nothing is sent
anywhere except to your local AI CLI through the companion service.

## Project layout

```
companion/            Local companion service + providers (Node, no framework)
src/app/(app)/        Authenticated screens (dashboard, upload, courses, learn,
                      quiz, mock, progress, revision, notes, settings)
src/app/api/          API routes (auth, upload, courses, learn, quiz, mock, …)
src/lib/ai/           Companion client + JSON parsing
src/lib/ingest/       PDF extraction + outline generation
src/lib/teach/        Lesson generation + source-context gathering
src/lib/quiz/         Quiz + mock generation, scoring
src/lib/store/        Atomic JSON file store + repositories
src/components/       UI (shadcn/ui primitives + app components)
```
