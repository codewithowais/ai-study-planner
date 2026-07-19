# Token-Efficient AI Memory Design

## Goal

Reduce repeated Claude and Codex input tokens without losing uploaded-source fidelity,
citations, tutor continuity, weak-topic history, or the ability to switch providers.

## Research Basis

- Anthropic and OpenAI both recommend putting byte-stable instructions and reusable
  context first, with changing user content last, because prompt caches match exact
  prefixes.
- Claude Code supports replacing its default coding-agent system prompt, removing
  tools from model context, disabling customizations, disabling session persistence,
  and requesting schema-validated JSON in print mode.
- Codex non-interactive mode supports ephemeral runs, ignoring user configuration,
  machine-readable JSONL usage events, and schema-constrained output.
- Long conversations should be compacted into durable state rather than replaying an
  ever-growing transcript. Provider-owned continuation is not the primary memory
  mechanism here because the app must preserve context when switching providers.

## Architecture

### Immutable source memory

Uploaded resources remain unchanged and authoritative. Optimization must never delete
or replace source text with an AI summary. Every generated memory item carries a
source fingerprint so stale content is detectable.

### Quality-first boundary

Token reduction removes repeated provider work and irrelevant coding-agent context;
it must never reduce teaching depth, source coverage, model quality, or requested
output length. Lessons, summaries, flashcards, quizzes, mock exams, and outline batches
must pass deterministic completeness checks before they can be returned or cached.

A valid response uses one provider call. An incomplete but structurally recoverable
response receives one explicit full-quality repair attempt. A second incomplete result
fails visibly instead of exposing or caching weak content. Provider/network failures do
not trigger blind retries. Long source pages are split into overlapping segments rather
than truncated, and long tutor chats retrieve older exchanges relevant to the latest
question while retaining the exact durable transcript.

### Versioned generated memory

Lessons, summaries, and flashcards are stored in an envelope containing the generated
value and a deterministic fingerprint of the source references, source page text,
learning level, depth, provider, model, and prompt version. A cache hit is valid only
when the fingerprint matches the current request.

Legacy unwrapped cache files remain readable only as misses and are replaced lazily.

### Durable tutor memory

Tutor chats are stored per user, course, and topic. The store keeps:

- the complete transcript for UI resume;
- a deterministic compact memory of older turns;
- the most recent turns verbatim;
- timestamps for lifecycle and debugging.

The compact memory preserves recent student questions, tutor conclusions, cited pages,
misconceptions, and unresolved questions within a fixed prompt budget. It is generated
locally from the transcript without an extra AI call in this first iteration. The full
transcript remains available as the durable record, so prompt compaction never deletes
learner history.

### Concurrent generation control

Identical lesson, summary, and flashcard generations share one in-process promise keyed
by the same source fingerprint. Concurrent tabs, retries, duplicate development renders,
or rapid clicks therefore invoke a provider once and receive the same result. Failed
requests release the lock immediately so a real retry can proceed.

### Prompt construction

Prompts use this stable-to-dynamic order:

1. security and tutor system instruction;
2. topic identity and immutable source material;
3. durable compact tutor memory;
4. recent conversation turns;
5. latest student message.

The client sends only the newest message. The server owns history, preventing request
tampering and triangular transcript growth.

### Provider execution

Claude runs in print mode with a replacement tutor system prompt, no tools, safe mode,
and no session persistence. Codex runs ephemerally, ignores user configuration, uses a
read-only sandbox, and emits JSONL so token usage can be captured. Provider sessions
remain stateless; application memory is portable across providers.

### Usage telemetry

Every generation result exposes normalized input, cached-input, cache-write, output,
and reasoning token counts when the CLI supplies them. The companion logs one local
structured event per generation with feature name, provider, model, duration, and
usage. Prompts and source text are never logged.

## Safety And Compatibility

- Uploaded text remains inside explicit untrusted-material delimiters.
- No browser request can supply shell flags, commands, environment variables, or a
  provider session identifier.
- Windows compatibility continues through `cross-spawn`; no shell-specific command
  strings are introduced.
- Older Claude/Codex versions fail with actionable upgrade errors rather than silently
  falling back to a high-token unsafe mode.

## Quality Gates

- Unit tests prove provider argument construction removes coding-agent context and
  persistence.
- Unit tests prove chat compaction retains older memory and exact recent turns within
  a fixed character budget.
- Unit tests prove cache fingerprints change when resources, level, depth, provider,
  model, or prompt version change.
- Unit tests prove concurrent identical generations share one request and failures do
  not leave a stuck lock.
- Existing TypeScript checks and production build pass.
- A live Claude comparison records materially lower input tokens.
- Browser testing confirms chat survives reload and topic isolation remains correct.

## Deferred Optimizations

- Source-chunk retrieval and topic knowledge packs.
- Versioned reusable quiz question banks and mock-exam composition.
- Per-feature model and reasoning profiles.
- User-facing token analytics.

These follow after the foundation has measured real usage and protected context
correctness.
