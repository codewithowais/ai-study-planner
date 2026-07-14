# AI Study Partner / Personal Tutor — Design Spec

**Date:** 2026-07-13
**Status:** Approved to build (feature-by-feature, Loop Engineering)

## Goal
A local-first AI tutor. User uploads study material (PDF/notes/slides/images), the
system organizes it into Subject → Chapter → Topic → Subtopic, teaches each topic from
beginner level with citations back to the source, quizzes the user, scores answers,
identifies and re-teaches weak topics, and tracks syllabus progress + exam readiness.

## Confirmed decisions
- **Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Auth:** single local user (email + locally-hashed password, cookie session). No SQLite.
- **Storage:** JSON file store under `./data/` (git-ignored). A typed repository layer
  (`lib/store/*`) wraps atomic file reads/writes so we can swap backends later.
- **AI:** Next.js API route → **Local Companion Service** (separate Node process, localhost
  only, shared-secret header) → spawns `claude` CLI (default) or `codex` CLI. Provider
  behind an interface (`AiProvider`) so official APIs slot in later. The browser and the
  Next server never spawn a child process directly; the companion accepts a fixed JSON
  request shape, never a shell string — no arbitrary shell, no token/env exposure.
- **Runtime:** Node 23 via `.toolchain/bin` (Node 16 is system default). Dockerfile +
  docker-compose provided for later use (Docker not installed in this environment).

## Security rules
- Uploaded documents are **untrusted**. Their text is passed to the model as *data to
  teach from*, wrapped in explicit delimiters with a system instruction that content
  inside is never to be executed as instructions.
- Companion service binds to 127.0.0.1 only, requires a shared secret from an env file,
  and validates every request against a strict schema.
- No secrets/tokens exposed to the browser.

## Data model (JSON documents)
- `users.json` — `{ id, email, passwordHash, createdAt }`
- `sessions.json` — `{ token, userId, expiresAt }`
- `courses/<courseId>.json` — outline: subjects→chapters→topics→subtopics, each topic has
  `{ id, title, status, sources:[{file,page,snippet}], summary }`, plus coverage report.
- `resources/<resourceId>.json` + extracted text chunks with page refs.
- `progress/<courseId>.json` — per-topic status (not-started/learning/completed/weak/
  mastered), quiz scores, bookmarks, notes, lastVisited (for resume).

## UX states (every screen)
Loading, empty, error + retry, no-results. Responsive: mobile / tablet / desktop.

## Build order (each phase built THEN browser-tested before next)
0. Scaffold Next.js + Tailwind + shadcn/ui; dev server verified in browser.
1. Login + onboarding (local auth, JSON store).
2. Resource upload + PDF text extraction + outline generation via companion→claude CLI.
3. Course outline view + topic selection + "Learn Everything Step-by-Step".
4. Learning workspace + AI teaching with citations + AI tutor chat.
5. Topic quiz + scoring + mistake explanations.
6. Weak topics + progress dashboard + exam readiness + resume.
7. Remaining screens: mock exam, notes/bookmarks, revision, AI provider settings.
8. Dockerfile/compose, responsive QA pass, final report.

## First Complete Flow (priority)
Phases 1–6 deliver: upload → process → topics → select → teach → quiz → score → weak →
progress saved → resume. This is verified in the browser before anything else is polished.
