# AI Study Partner Token Optimization Report

**Report date:** July 14, 2026  
**Project:** AI Study Partner / Personal Tutor  
**Scope:** Claude Code and Codex CLI generation, tutor memory, generated-content caching, duplicate-request control, telemetry, and verification  
**Status:** Implemented and verified, with the Codex live-test limitation documented below

## 1. Executive Summary

The optimization reduced a minimal Claude tutor request from approximately **20,014 input tokens to 799 input tokens**, a measured reduction of **96.0%**. Reported equivalent request cost decreased from **$0.0189409 to $0.00148**, a reduction of **92.2%**.

The application now preserves the complete tutor transcript locally while sending only bounded recent context and compact older memory to the selected provider. Uploaded study resources remain the authoritative source and are never replaced by an AI summary.

Lessons, summaries, and flashcards now use versioned source fingerprints. An unchanged summary that initially took **12.424 seconds** returned from the local cache in **187 milliseconds** on the second request, with no additional AI invocation. This was a **98.5% latency reduction** and approximately **66.4x faster**.

Browser testing also discovered a concurrent-generation race. Two identical lesson requests could previously invoke Claude twice before the first result was cached. A single-flight guard now makes concurrent identical requests share one provider call.

Quality remains the governing constraint. The system now rejects incomplete teaching content, repairs it once at full quality when necessary, and never shortens explanations merely to reduce tokens. Valid responses still use one provider call.

## 2. Objectives

The work had five non-negotiable objectives:

1. Reduce repeated input tokens and provider cost.
2. Preserve student history, learning progress, source fidelity, and citations.
3. Keep memory portable when switching between Claude and Codex.
4. Maintain the local companion security boundary with no browser shell access.
5. Prove the result through automated, API, live-provider, and browser tests.

## 3. Before And After

| Area | Before | After | Student impact |
|---|---|---|---|
| Claude system context | Tutor instructions were appended to Claude Code's default coding-agent context. | The coding-agent prompt is replaced with a small tutor-only system prompt. | Less waiting and substantially fewer repeated tokens. |
| Claude tools | Coding-oriented tool context could remain present even though tutoring did not require it. | Safe mode, an empty tool set, empty MCP servers, one turn, and no session persistence are enforced. | Lower overhead and a smaller attack surface. |
| Codex execution | Codex could inherit general user configuration and coding-agent behavior. | Ephemeral execution, ignored user rules/configuration, read-only sandboxing, disabled shell/web/apps/multi-agent features, and minimal tutor instructions. | Provider remains modular without giving study material access to local tools. |
| Tutor chat request | The browser sent the conversation transcript back with each message. | The browser sends only the latest message; the server owns and persists topic history. | Faster requests, less tampering risk, and reliable resume behavior. |
| Long-term memory | Chat continuity depended on the client-side session. | The complete exact transcript is stored per user, course, and topic. | Conversations survive reloads and provider changes. |
| AI prompt memory | Conversation input could grow with every turn. | Six recent messages remain exact; older turns are compacted within a fixed local prompt budget. | Context growth is bounded without deleting the underlying history. |
| Generated lessons | A cached lesson was trusted without proving its source and settings were still current. | Every lesson carries a SHA-256 fingerprint covering source text, topic, level, depth, provider, model, and prompt version. | Updated resources or settings cannot silently reuse stale teaching. |
| Lesson depth | Simpler or deeper explanations could overwrite the normal lesson cache. | Standard, simpler, and deeper lessons use separate cache variants. | Students can change explanation depth without losing the normal lesson. |
| Summaries and flashcards | Unversioned cache files could become stale. | Both use the same versioned source-aware cache envelope. | Repeated use is instant while source changes correctly invalidate old output. |
| Concurrent requests | Identical uncached requests could run simultaneously and spend tokens twice. | Identical in-flight generations share one promise keyed by the fingerprint. | Double-clicks, duplicate development renders, tabs, and retries do not duplicate AI cost. |
| Token visibility | Provider usage was not normalized by feature. | Input, cached input, cache write, output, reasoning, model, cost, and duration are logged as local metadata. | Future optimization can be based on evidence rather than estimates. |
| Logging safety | Provider errors and output handling were not designed for usage analysis. | Prompts and uploaded source text are excluded from telemetry. | Token measurement does not expose study content. |
| Output quality | Structurally valid JSON could contain empty lessons, thin summaries, too few questions, or duplicate flashcards. | Feature-specific completeness contracts reject weak content and allow one full-quality repair. | Weak output is never silently shown or cached. |
| Long source pages | Outline analysis read only the first 1,500 characters of each page. | Pages are divided into overlapping 2,500-character segments and every segment is analyzed. | Topics near the end of a long page are no longer silently omitted. |
| Old chat context | Compact memory favored only the most recent older turns. | Relevant older question/answer pairs are retrieved using the latest student question. | Long conversations retain useful prior misconceptions and explanations. |

## 4. Quantitative Results

### 4.1 Minimal Claude Provider Probe

The same class of one-word tutor probe was measured before and after replacing the coding-agent context.

| Metric | Before | After | Improvement |
|---|---:|---:|---:|
| Reported input tokens | 20,014 | 799 | 96.0% lower |
| Reported equivalent cost | $0.0189409 | $0.00148 | 92.2% lower |
| Live result | Successful | Successful (`ready`) | Behavior preserved |

Calculation:

```text
Token reduction = (1 - 799 / 20,014) x 100 = 96.01%
Cost reduction  = (1 - 0.00148 / 0.0189409) x 100 = 92.19%
```

This probe measures provider-wrapper overhead. Real lesson and tutor requests also include the student's source material and therefore use more input tokens by design.

### 4.2 Application-Level Summary Cache

| Request | Result | Duration | AI invocation |
|---|---|---:|---:|
| First grounded summary | Generated and saved with a source fingerprint | 12,424 ms | 1 |
| Identical second summary | Returned from local cache | 187 ms | 0 |

```text
Latency reduction = (1 - 187 / 12,424) x 100 = 98.49%
Speed improvement = 12,424 / 187 = 66.44x
```

The second request produced no companion generation event, confirming that it did not invoke Claude or Codex.

### 4.3 Concurrent Duplicate Suppression

Test procedure:

1. Remove the selected lesson variant cache.
2. Submit two identical lesson requests concurrently.
3. Compare both API responses.
4. Inspect companion generation telemetry.

Both requests returned HTTP 200 with identical five-section lesson content. The companion recorded one provider generation for the request pair.

### 4.4 Tutor Chat Memory

The tested topic stored four exact messages:

```text
user -> assistant -> user -> assistant
```

The history remained available through the chat API, browser reload, and application restart. The response cited `FIN623_handouts_1_45-1.pdf, p.1`.

The first real topic-chat request reported 3,581 rendered input tokens, including source material and a cache-write component. A changing follow-up did not receive a provider cache read for this relatively short prefix. This is why application-level caches are used for deterministic outputs while changing chat turns rely on bounded memory rather than an assumption that provider caching will always apply.

### 4.5 Savings In Plain Figures

#### Lean provider wrapper

The minimal provider comparison saved **19,215 input tokens per request**:

```text
20,014 before - 799 after = 19,215 input tokens saved
```

| Number of equivalent requests | Input tokens saved | Reported equivalent cost saved |
|---:|---:|---:|
| 1 | 19,215 | $0.0174609 |
| 10 | 192,150 | $0.174609 |
| 100 | 1,921,500 | $1.74609 |
| 1,000 | 19,215,000 | $17.46090 |

These projections apply the measured minimal-probe difference consistently. Real requests have different source and output sizes, so actual totals will vary.

#### Repeated summary cache

The measured summary generation reported 3,616 input tokens and 805 output tokens, or **4,421 total reported tokens**. Every valid cache hit after the first generation saves that entire provider request.

| Total views of the same unchanged summary | Provider calls avoided | Total reported tokens saved | Reported equivalent cost saved |
|---:|---:|---:|---:|
| 2 | 1 | 4,421 | $0.02534 |
| 10 | 9 | 39,789 | $0.22806 |
| 100 | 99 | 437,679 | $2.50866 |
| 1,000 | 999 | 4,416,579 | $25.31466 |

For an unchanged generated lesson, summary, or flashcard deck, each valid application cache hit therefore saves **100% of the AI tokens that regeneration would have consumed**.

#### Duplicate lesson prevention

The concurrent lesson scenario recorded one generation with 4,459 input tokens and 2,558 output tokens. Preventing the second identical generation saved approximately:

```text
4,459 input + 2,558 output = 7,017 reported tokens
Reported equivalent cost avoided = $0.055083
```

For that two-request race, single-flight execution reduced provider usage from two calls to one: a **50% token and generation-cost saving** for the pair.

> Cost figures are the CLI's reported API-equivalent values. A subscription account may not invoice these amounts per request, but the figures remain useful for comparing relative resource usage.

### 4.6 Live Quality Gate Results

The stricter contracts were tested through the authenticated Claude provider. All three representative generations passed on their first attempt, so no repair tokens were required.

| Feature | Measured quality result | Repair calls |
|---|---|---:|
| Lesson | 5 sections, 6,410 teaching characters, 7 definitions, 2 examples, 6 exam tips, and 6 citations across source pages 1-2 | 0 |
| Summary | 273-character overview, 8 substantial key points, and 8 key terms | 0 |
| Topic quiz | Exactly 3 questions; every question had 4 unique choices and one valid answer | 0 |

Quality repair is intentionally conditional: it spends extra tokens only after deterministic validation rejects an incomplete response. If both attempts fail, the UI receives an error/retry state rather than low-quality educational content.

## 5. Memory And Context Preservation

Token reduction does not delete student memory:

- Uploaded resource pages remain unchanged and authoritative.
- Generated summaries never replace raw resource text.
- The complete tutor transcript remains in the local JSON store.
- The AI receives exact recent turns and compact older context within fixed limits.
- Chat history belongs to the application rather than a Claude- or Codex-specific session.
- Switching providers therefore does not erase the student's conversation.
- Course progress, quiz scores, weak topics, notes, bookmarks, and review schedules are unchanged.
- Cache fingerprints invalidate generated content whenever source text or relevant teaching settings change.

This design intentionally separates **durable memory** from **prompt context**. Durable memory is complete; prompt context is selective and bounded.

## 6. Security Improvements

- The browser still cannot run CLI or shell commands.
- The local companion remains bound to `127.0.0.1` and requires its shared secret.
- Provider names and generation features are selected from bounded values.
- Uploaded text stays inside explicit `<UNTRUSTED_MATERIAL>` boundaries.
- Claude receives no tools or MCP servers for tutoring.
- Codex is configured without shell, web search, apps, multi-agent, memory, or hooks.
- Provider child processes receive an allowlisted environment rather than all application secrets.
- Prompts, chat text, and uploaded source text are not written to usage logs.
- Cross-platform process execution continues through `cross-spawn` for macOS, Linux, and Windows command resolution.

## 7. Issues Found And Fixed

| Finding | Risk | Fix | Verification |
|---|---|---|---|
| Claude rejected `{}` as an MCP configuration. | Live Claude generation failed despite passing argument tests. | Changed the empty configuration to `{"mcpServers":{}}` and added a regression assertion. | Live authenticated Claude probe succeeded. |
| Development rendering generated the same uncached lesson twice concurrently. | Approximately double provider cost for one visible action. | Added fingerprint-keyed single-flight generation. | Two concurrent API requests produced one provider event. |
| Tutor history was client-owned and not durable. | Reload or provider switch could lose context. | Added per-topic server-side chat storage and a history API. | Four messages restored after reload and restart. |
| Lesson depth variants shared one cache file. | Simpler/deeper actions could replace the standard lesson. | Added separate cache files per depth. | Repository and route tests passed. |
| Legacy generated files had no source validity proof. | Stale teaching could survive a resource or setting change. | Treat legacy files as cache misses and lazily replace them with fingerprinted envelopes. | Fingerprint invalidation tests passed. |
| Build output logged Next.js dynamic-route signals as application errors. | Misleading QA results. | Shared API handling now rethrows the framework signal. | Final production build completed without false API errors. |
| Preview launch hardcoded port 3005. | Preview failed when another process already occupied the port. | Enabled automatic port assignment and removed the hardcoded port argument. | App restarted using the assigned `PORT`. |
| Valid JSON could still be educationally incomplete. | Empty or shallow content could reach students and be cached. | Added minimum depth, count, uniqueness, explanation, example, exam-tip, and citation requirements with one repair attempt. | Unit tests and live Claude lesson/summary/quiz checks passed. |
| Outline pages were truncated at 1,500 characters. | Later topics on dense pages could be silently skipped. | Added overlapping full-page segmentation and removed prompt truncation. | Boundary and full-marker representation tests passed. |

## 8. Verification Evidence

### Automated

- **27 tests passed, 0 failed.**
- Provider argument and telemetry normalization tests passed.
- Cache stability and invalidation tests passed.
- Concurrent request sharing and failure-retry tests passed.
- Tutor recent-memory, compaction-budget, and prompt-order tests passed.
- Old relevant tutor-exchange retrieval tests passed.
- Lesson, summary, flashcard, quiz, and mock-quality contract tests passed.
- Full long-page source representation and overlap tests passed.
- TypeScript strict check passed with zero errors.
- Production build compiled and generated all 41 application/API routes successfully.
- `git diff --check` reported no whitespace errors.

### Live Provider And API

- Claude Code CLI installation and subscription authentication worked live.
- Minimal Claude tutor probe returned the requested result.
- Grounded tutor answer included a real uploaded-file citation.
- Live lesson, summary, and quiz outputs passed the stricter quality gates without repair calls.
- Summary cache returned without a second provider invocation.
- Lesson and chat APIs returned HTTP 200 after process restart.
- Companion health returned both modular providers: Claude and Codex.

### Browser And Responsive QA

- Lesson rendered with source citations and restored tutor history.
- Cached summary opened from the responsive action bar.
- Tested viewport widths: 390 px, 768 px, and 1280 px.
- No horizontal document overflow was detected.
- Contents, Flashcards, Summarize, and More controls remained visible on mobile.
- Mobile controls wrapped into usable rows rather than leaving the viewport.

## 9. Files And Architecture

Primary implementation areas:

- `companion/provider-utils.mjs`: minimal CLI arguments, safe environment, and usage normalization.
- `companion/providers/claude.mjs`: tool-free, stateless Claude execution.
- `companion/providers/codex.mjs`: ephemeral, read-only Codex execution.
- `companion/server.mjs`: feature metadata and local token telemetry.
- `src/lib/teach/chat-memory.ts`: bounded prompt context from durable history.
- `src/app/api/learn/chat/route.ts`: server-owned tutor conversation.
- `src/lib/ai/cache-key.ts`: deterministic generation fingerprints.
- `src/lib/ai/generation-lock.ts`: concurrent duplicate suppression.
- Lesson, summary, and flashcard routes: source-aware cache validation.
- `docs/superpowers/specs/2026-07-14-token-efficient-ai-memory-design.md`: approved architecture.
- `docs/superpowers/plans/2026-07-14-token-efficient-ai-memory.md`: completed implementation plan.

The implementation updates the provider, cache, memory, ingestion, quiz, teaching, API, test, and documentation layers.

## 10. Remaining Limitations

1. **Codex live execution:** The installed Codex package on this Mac is missing its native executable. Codex argument construction, parsing, security configuration, and Windows command handling are tested, but a real Codex generation could not be completed on this machine.
2. **Changing chat turns:** Tutor follow-ups are new generations. Their prompt size is bounded, but they cannot use the deterministic output cache because the question and conversation change.
3. **Provider cache behavior:** Exact-prefix provider caching depends on provider/model thresholds and CLI behavior. The application does not count on it for correctness or guaranteed savings.
4. **Process-local single flight:** Concurrent suppression works within one Next.js process. A future multi-instance deployment would require a distributed lock.
5. **Legacy cache migration:** Existing unversioned files regenerate once on first use, then become efficient fingerprinted caches.
6. **Standalone lint command:** The project does not yet have a committed ESLint configuration, so `npm run lint` opens Next.js's initial configuration prompt. Tests, strict TypeScript, production build checks, and browser QA were completed.

## 11. Recommended Next Improvements

| Priority | Improvement | Expected value |
|---:|---|---|
| 1 | Repair/reinstall Codex and run the same live token benchmark. | Completes provider parity evidence. |
| 2 | Add versioned quiz question banks and compose mock exams from validated questions. | Reduces repeated quiz/mock generation while preserving variety. |
| 3 | Add source-chunk retrieval for very large topics. | Sends only relevant pages while retaining citations and raw-source authority. |
| 4 | Add relevance-based retrieval from older tutor turns. | Recovers old context without replaying the complete transcript. |
| 5 | Add per-feature model profiles. | Uses smaller models for summaries/flashcards and stronger models where reasoning matters. |
| 6 | Add a private usage dashboard by feature/course. | Makes future cost and latency regressions visible. |
| 7 | Add a committed ESLint configuration and CI job. | Removes the remaining automated-quality tooling gap. |
| 8 | Add a distributed generation lock if the app moves beyond one local process. | Prevents duplicate cost in horizontally scaled deployments. |

## 12. Research References

- [Anthropic Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction)
- [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)

## 13. Conclusion

The optimization achieved a large measured reduction in provider overhead while preserving uploaded-source fidelity and durable student memory. Generated-content reuse now depends on exact source validity, concurrent duplicates no longer create duplicate provider cost, and the application has enough local telemetry to guide future optimization.

The main remaining work is live Codex parity, larger-topic retrieval, reusable quiz/mock banks, and user-facing usage analytics. None of those limitations invalidate the verified Claude, cache, memory, security, or responsive results recorded in this report.
