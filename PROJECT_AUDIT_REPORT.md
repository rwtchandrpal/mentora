# Mentora — Project Audit Report

**Audit date:** 2026-11-20
**Commit audited:** `5d6496a` (branch `main`, clean working tree)
**Scope:** Entire monorepo — `apps/server`, `apps/client`, `packages/shared`, root configuration, deployment descriptors, tests and docs.
**Method:** Full read of server and shared source, targeted read of client source (all core state, networking, routing, rendering and the largest components), plus execution of type-check, lint, test and build. No source code was modified.

---

## 1. Project overview and technology stack

Mentora is an AI tutoring web app. A learner enters a topic and studies it in three modes backed by Google Gemini:

- **Explain**: four progressive cards (intuition → mechanism → example → check-for-understanding), plus up to two "Go Deeper" sub-cards per step.
- **Interact**: a Socratic dialogue streamed over SSE, with 3–5 milestones and a 3-strike "circuit breaker" that switches to a direct explanation.
- **Practice**: 10-question MCQ batches in Easy, Medium and Hard tiers. Grading is deterministic, and each tier unlocks the next.

Registered users have a learner profile and a daily AI quota of 50 actions. Guests (added in `b8b861f`) get ephemeral sessions with a 2-hour TTL and a quota of 15 actions per day.

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces (`packages/*`, `apps/*`), Node ≥ 20, TypeScript 6 (strict, `noUncheckedIndexedAccess`) |
| Shared | `@mentora/shared`: Zod 4 schemas, enums, constants, DTO types (built to `dist/`) |
| Server | Express 5, Mongoose 9 (MongoDB), `@google/genai`, jsonwebtoken (HS256), bcryptjs, helmet, cors, express-rate-limit, pino |
| Client | React 19, Vite 8, Redux Toolkit, React Router 7, axios, react-markdown + remark-gfm/math + rehype-katex, mermaid 12, Tailwind 3 |
| Tests | Vitest 4 (root runner), supertest, mongodb-memory-server, Testing Library + jsdom |
| Deploy | Render (server, `render.yaml`), Vercel (client, `apps/client/vercel.json`) |

## 2. Architecture and major components

```
client (React/Redux) ──axios/fetch──▶ /api/v1 (Express)
                                        ├─ routes → middlewares (optionalAuth / requireAuth, requireCompletedProfile, quota, validate)
                                        ├─ controllers (thin; attach quota meta)
                                        ├─ services (explain / interact / practice / session / auth)
                                        │     └─ ai/ (gemini.client: structured output + retry, streamContent; model.router; prompt.builder)
                                        └─ repositories → Mongoose models (User, TopicSession)
```

- **Server entry**: `apps/server/src/index.ts` connects to Mongo, then listens. `app.ts` wires helmet, CORS, a global rate limiter (100 requests per 15 min per IP), JSON parsing and routers.
- **Auth**: JWT bearer tokens. `optionalAuth` attaches `req.user` when a token is present and lets guests through otherwise.
- **Quota**: user quota lives in the `User.usageQuota` subdocument. Guest quota lives in a process-local `Map` keyed by client IP (`middlewares/quota.middleware.ts`).
- **Sessions**: one `TopicSession` document holds all three mode states. Guest sessions have `isGuest: true` and `expiresAt`, and a TTL index removes them.
- **AI**: `generateStructuredOutput` calls Gemini with a JSON schema, validates with Zod and retries once. Refusals become 422. `streamContent` yields text chunks for Interact. The stream starts with a `<<MENTORA_STATE:{...}>>` control header that `ControlHeaderStreamParser` strips out.
- **Client**: the Redux slices are `auth`, `session` and `ui`. `useSseStream` parses SSE frames by hand from `fetch`. `RichMarkdownRenderer` renders Markdown, KaTeX, Mermaid and code blocks.

## 3. Audit areas covered

| Area | Coverage |
|---|---|
| Bugs / business logic | All server services, controllers, middlewares, repositories. Client thunks, SSE hook, routing guards, sidebar and practice flows |
| Security | AuthN/AuthZ (users and guests), JWT handling, rate limiting, IP derivation, error disclosure, HTML injection sinks (`dangerouslySetInnerHTML`), CORS/helmet |
| Backend / API | Validation, error envelopes, SSE lifecycle, quota accounting, idempotency |
| Database | Schemas, indexes, query shapes, concurrency (read-modify-save) |
| Frontend | State consistency, timeouts, accessibility (sampled), bundle size |
| Performance | DB round-trips per request, payload sizes, prompt growth, bundle |
| Dependencies | Manifest review (no install/upgrade performed; no registry audit run) |
| Testing | Ran full suite and reviewed existing test titles for gaps |
| Configuration | `env.ts`, `.env.example` files, `render.yaml`, `vercel.json`, tsconfig, vitest/eslint config |

## 4. Findings

Each finding is labelled **Confirmed** (verified from code, from command output, or both) or **Potential** (a plausible risk that was not reproduced).

### Summary

| ID | Priority | Title | Status |
|---|---|---|---|
| A-01 | **P0** | Any unauthenticated client can read, modify or delete any guest session by ID | Confirmed |
| A-02 | **P1** | Guest AI quota bypass via spoofed `X-Forwarded-For` | Confirmed |
| A-03 | **P1** | Create-session request times out on the client (15 s) while the server is still running AI generation | Confirmed |
| A-04 | **P1** | Failures after SSE headers are flushed are not reported to the client (e.g. empty AI reply fails validation) | Confirmed |
| A-05 | P2 | Completed practice batch can be re-submitted after answers are revealed | Confirmed |
| A-06 | P2 | Guests are charged quota for operations that perform no AI work | Confirmed |
| A-07 | P2 | Quota check-then-act race and duplicate AI generation on concurrent requests | Confirmed (by code path) |
| A-08 | P2 | Guest quota store is unbounded, process-local and lost on restart | Confirmed |
| A-09 | P2 | Expired token breaks all guest-capable routes; client has no global 401 recovery | Confirmed |
| A-10 | P2 | Deployment config contradicts the intended reasoning-model change | Confirmed |
| A-11 | P2 | Interact prompt includes the entire, unbounded chat history on every turn | Confirmed |
| A-12 | P2 | Session list query loads full documents (all cards, messages, questions) | Confirmed |
| A-13 | P2 | Mode routers mounted twice; 4–6 `User` lookups per AI request | Confirmed |
| A-14 | P2 | Client abort does not cancel the Gemini stream; aborted turns are still persisted and billed | Confirmed |
| A-15 | P2 | No dedicated rate limiting on `/auth/login` and `/auth/register` | Confirmed |
| A-16 | P2 | 1.78 MB main JS chunk (Mermaid statically bundled) | Confirmed (build output) |
| A-17 | P3 | Internal upstream error messages exposed to clients | Confirmed |
| A-18 | P3 | Sidebar clears the active session even when delete fails | Confirmed |
| A-19 | P3 | Duplicate `GET /sessions/:id` when selecting a session from the sidebar | Confirmed |
| A-20 | P3 | Interact chat textarea has no accessible label | Confirmed |
| A-21 | P3 | Dead `KaTeXBlock` component with an unsafe HTML fallback | Confirmed |
| A-22 | P3 | Non-401 failure of `/auth/me` leaves an inconsistent auth state with no retry | Confirmed |
| A-23 | P3 | Test files (and scripts) are compiled into production `dist/` | Confirmed |
| A-24 | P3 | Redundant or unused MongoDB indexes on `TopicSession` | Confirmed |
| A-25 | P3 | Client response types disagree with server responses | Confirmed |
| A-26 | P3 | `eval:ai` ignores configured model names | Confirmed |
| A-27 | P3 | Repeated logic across controllers and services | Confirmed |
| A-28 | P3 | Account enumeration via register message and login timing | Confirmed |
| A-29 | P3 | Health check does not reflect database connectivity | Confirmed |
| A-30 | P3 | Documentation does not describe guest mode | Confirmed |
| A-31 | P3 | Test coverage gaps for the defects above; no coverage tooling | Confirmed |

---

### A-01 — P0 — Any unauthenticated client can read, modify or delete any guest session by ID

**Evidence**
- `apps/server/src/repositories/session.repository.ts:66-81`: `findSession(sessionId, undefined)` returns any document where `isGuest === true`. There is no ownership check.
- `session.repository.ts:121-135` (`updateLastActiveMode`) and `:156-166` (`deleteByIdAndUserId`) use the same "is it a guest session?" rule for writes and deletes.
- All session and mode routes use `optionalAuth` (`routes/session.routes.ts:21`, `explain.routes.ts:17`, `interact.routes.ts:14`, `practice.routes.ts:17`), so requests need no credentials.
- The session ID is exposed in the URL (`/workspace/:sessionId`, `pages/WorkspacePage.tsx:107`).
- MongoDB ObjectIds are not secret. Within one server process they share a fixed random segment and an incrementing counter, so IDs created close together differ only in the timestamp and counter bytes.

**Impact:** Anyone who knows or guesses a guest session ID can read the learner's typed messages, use AI on that session (charged to the attacker's IP), change its mode or **delete it** (data loss). The `guest-mode.routes.test.ts` suite only tests that a guest can access "their" session; no test checks isolation between guests.

### A-02 — P1 — Guest AI quota bypass via spoofed `X-Forwarded-For`

**Evidence**
- `apps/server/src/middlewares/quota.middleware.ts:40-46`: `getGuestIdentifier` uses the **left-most** `X-Forwarded-For` value, which the client controls. It only falls back to `req.ip` when that header is absent.
- `apps/server/src/app.ts:18` sets `trust proxy` to `1`, so `req.ip` is already the correct proxy-derived address. The custom parsing bypasses it.
- `guest-mode.routes.test.ts:161,173` sets this header in tests, which shows it drives the guest identity.

**Impact:** A guest can send a different `X-Forwarded-For` value on each request and never reach the 15-action limit. The only remaining cap is the global limiter (100 requests per 15 min per real IP, about 9,600 per day). Each request can trigger paid Gemini calls, including the reasoning model and retries. Each spoofed value also adds a permanent entry to the in-memory store (see A-08).

### A-03 — P1 — Create-session request times out on the client while the server is still generating

**Evidence**
- `apps/client/src/services/apiClient.ts:175`: the default axios timeout is 15 000 ms.
- `apps/client/src/store/sessionSlice.ts:95-104`: `createSessionThunk` posts `/sessions` without overriding the timeout. Other AI thunks set 30–60 s explicitly (`:200,251,277,303`).
- `pages/WorkspacePage.tsx:92-104` and `components/explain/ExplainStage.tsx:89-94` never send `autoInitialize: false`.
- `apps/server/src/services/session.service.ts:180-198`: the server then runs full AI initialisation inside the create request. For Practice that is the reasoning model generating 10 MCQs. `generateStructuredOutput` can make two attempts with a 2 s pause between them (`ai/gemini.client.ts:74-237`).

**Impact:** Creating a Practice session, and often Explain or Interact on a slow model, can show "Request timed out" even though the server finishes. The session is saved, quota is charged, and the session shows up in history later. The user sees a failure and may retry, which burns more quota.

### A-04 — P1 — Failures after SSE headers are flushed are not reported to the client

**Evidence**
- `apps/server/src/controllers/interact.controller.ts:60-72`: SSE headers are flushed (`new SseWriter(res)`), then `processTurnStream` runs inside `try/finally { sseWriter.close() }`. Any exception still propagates to `asyncHandler`, which calls `next(err)`.
- `apps/server/src/middlewares/error.middleware.ts:17-60` always calls `res.status(...).json(...)` and never checks `res.headersSent`. After the SSE response has ended, this throws `ERR_HTTP_HEADERS_SENT`.
- One concrete trigger: `interact.service.ts:554` stores `accumulatedAssistantText.trim()` as the message content. The model schema requires it (`models/TopicSession.model.ts:183`, `content: { type: String, required: true }`). Mongoose's `required` validator rejects empty strings, so a reply containing only the control header (or nothing) makes `session.save()` at `:569` throw. Version conflicts from concurrent turns, or a DB outage, fail the same way.

**Impact:** The client receives tokens and then the stream closes without `metadata`, `error` or `done` (`hooks/useSseStream.ts:199-200` only calls `finishStreaming`). No error is shown, the turn is not saved, and the visible streamed text disappears on the next reload. The server logs a secondary headers-sent error that hides the root cause.

### A-05 — P2 — Completed practice batch can be re-submitted

**Evidence:** `apps/server/src/services/practice.service.ts:202-221` rejects `LOCKED` and `NOT_STARTED` but not `COMPLETED`. `:257-261` overwrites `userAnswers`, `score` and `completedAt`. Once a batch is completed, `sanitizePracticeBatch` (`services/session.service.ts:44-55`) returns `correctOptionIndex` and `solutionExplanation` to the client.
**Impact:** A learner (or script) can fetch the revealed answers and re-submit for a perfect score. This breaks score integrity and the BR-02/BR-03 rules.

### A-06 — P2 — Guests are charged quota for operations that perform no AI work

**Evidence**
- `controllers/explain.controller.ts:36-38` and `controllers/practice.controller.ts:37-39` always call `incrementGuestQuota` for guests, including when the service took the idempotent no-AI path (`explain.service.ts:59-61`, `practice.service.ts:74-89`).
- `controllers/interact.controller.ts:37-39`: `result.quota` is never set for guests, so idempotent re-init is also charged.
- `controllers/session.controller.ts:48-50` charges guests even when `autoInitialize === false`, which makes no AI call.
- Registered users are only charged inside services after real AI work (e.g. `explain.service.ts:127-129`).

**Impact:** Guest quota drains faster than user quota for the same actions. Revisiting a mode or reloading can consume guest actions. Quota accounting rules differ between the two user types.

### A-07 — P2 — Quota check-then-act race and duplicate AI generation

**Evidence:** `middlewares/quota.middleware.ts:84-104` checks `dailyCount >= limit`, but the increment happens only after the AI call finishes (`explain.service.ts:127-129`, `practice.service.ts:160-163`, `interact.service.ts:569-579`). The idempotency guards (`explain.service.ts:59`, `interact.service.ts:334-348`, `practice.service.ts:74-89`) read state that is only written after generation, so two concurrent `init`/`generate` calls both generate, both save (last write wins) and both charge.
**Impact:** Parallel requests (double-clicks, React StrictMode double effects, retries after a timeout as in A-03) can exceed the daily limit and double-bill AI usage.

### A-08 — P2 — Guest quota store is unbounded, process-local and lost on restart

**Evidence:** `middlewares/quota.middleware.ts:38-59`: a module-level `Map`. Entries are only replaced when the same key is seen again, and nothing ever evicts them.
**Impact:** Memory grows with every distinct identifier, and A-02 lets an attacker create those identifiers freely. Guest quotas reset on every deploy or restart, which is frequent on the Render free plan, and are not shared if the service is scaled to more than one instance.

### A-09 — P2 — Expired token breaks guest-capable routes; no client 401 recovery

**Evidence:** `middlewares/auth.middleware.ts:58-63`: `optionalAuth` throws 401 when a token is present but invalid or expired, so the request does not fall back to guest handling. On the client, only `fetchMeThunk.rejected` clears the token on 401 (`store/authSlice.ts:213-219`), and that thunk runs only at start-up (`routes/AppRouter.tsx:17-21`). The axios interceptor (`services/apiClient.ts:191-196`) only normalises errors.
**Impact:** When the 7-day token expires during use, every create, fetch, AI and stream action fails with "Invalid or expired authentication token" until the user reloads or logs out manually.

### A-10 — P2 — Deployment config contradicts the intended reasoning-model change

**Evidence:** Commit `1e13d24` changed the code default `GEMINI_REASONING_MODEL` to `gemini-3.5-flash-lite` "for stability" (`apps/server/src/config/env.ts:14`). `render.yaml:26-27` and `apps/server/.env.example:25` still set it explicitly to `gemini-3.6-pro`, and explicit values override the default.
**Impact:** Production keeps using the model the fix meant to move away from, so the stability fix has no effect where it matters.

### A-11 — P2 — Interact prompt includes unbounded history

**Evidence:** `services/interact.service.ts:479-482` maps **all** stored messages into the prompt. `ai/prompts/prompt.builder.ts:280-282,309-314` labels the section "Recent Conversation History" but never truncates it. Nothing limits the size of `interactState.messages`.
**Impact:** Token cost and latency grow linearly with each turn. Very long sessions risk model context limits and an ever-growing MongoDB document (16 MB cap).

### A-12 — P2 — Session list loads full documents

**Evidence:** `repositories/session.repository.ts:83-92`: `find({userId}).sort(...)` has no projection, no `.lean()` and no pagination. Only five summary fields are used (`session.service.ts:76-89`).
**Impact:** Each sidebar load transfers and hydrates every card, deep dive, chat message and MCQ for every session the user has. The cost grows with account age.

### A-13 — P2 — Mode routers mounted twice; redundant `User` lookups

**Evidence**
- `routes/session.routes.ts:42-44` nests `explainRouter`, `interactRouter` and `practiceRouter` inside `sessionRouter`. `app.ts:53-55` also mounts them at `/api/v1/sessions` after `sessionRouter`, and those app-level mounts are never reached for matching paths.
- `sessionRouter.use(optionalAuth, requireCompletedProfile)` (`:21`) and each mode router's own `.use(optionalAuth, …)` both run, so the JWT is verified and the `User` loaded twice.
- On an AI request, `requireAiQuota` then runs `syncQuotaWindow` (1–2 queries), the service re-loads the user (`explain.service.ts:67`), and the controller loads it again for quota meta (`explain.controller.ts:32`).

**Impact:** 4–6 `User` queries per AI request plus confusing routing. Removing one of the mounts naively could also silently change middleware order.

### A-14 — P2 — Client abort does not cancel the server-side stream

**Evidence:** `utils/sse.helper.ts:24-31` only marks the writer closed. `services/interact.service.ts:494-504` keeps reading the Gemini stream, then saves the turn and charges quota (`:561-579`). No abort signal is passed to `generateContentStream` (`ai/gemini.client.ts:284-291`). On the client, `abortStream` (`hooks/useSseStream.ts:39-45`) aborts the fetch.
**Impact:** A user who cancels or navigates away is still charged. The cancelled turn appears in the transcript on the next load, and the AI tokens are spent.

### A-15 — P2 — No dedicated rate limiting on auth endpoints

**Evidence:** `app.ts:29-45`: one global limiter (100 requests per 15 min per IP) for all `/api` routes. `routes/auth.routes.ts` adds nothing more.
**Impact:** Password guessing for a known email is limited only by IP rotation and the global bucket. The login rate is also shared with normal app traffic, so a busy legitimate user consumes the same budget.

### A-16 — P2 — Large initial bundle

**Evidence:** `pnpm build` output: `dist/assets/index-CziU14UM.js 1,783.84 kB │ gzip: 566.82 kB`, plus Vite's ">500 kB" warning. `components/common/MermaidDiagram.tsx:1` imports `mermaid` statically, and `RichMarkdownRenderer` is used on every mode screen.
**Impact:** Slow first load on mobile and slow networks, including on the login and register pages, which never render diagrams.

### A-17 — P3 — Internal error messages exposed

**Evidence:** `ai/gemini.client.ts:254-262` and `:313-321` put the raw upstream `cause` message into `AppError.details`, which `error.middleware.ts:30` returns to clients. `interact.service.ts:521-525` sends `streamErr.message` in the SSE `error` event.
**Impact:** Leaks SDK, provider and Zod internals (model names, quota messages, validation paths) to end users. The messages are also unfriendly UX.

### A-18 — P3 — Sidebar clears active session on failed delete

**Evidence:** `components/layout/LeftHistorySidebar.tsx:54-64`: `await dispatch(deleteSessionThunk(id))` resolves even when the thunk is rejected, and the code then clears the active session and navigates away without checking `.fulfilled`.
**Impact:** A failed delete (network or 5xx) looks successful: the open session closes while the list still shows it.

### A-19 — P3 — Duplicate session fetch on sidebar selection

**Evidence:** `LeftHistorySidebar.tsx:50-51` dispatches `fetchSessionByIdThunk` and then navigates. `WorkspacePage.tsx:69-76` dispatches the same fetch again because the active session does not match the new route yet.
**Impact:** Two identical full-session requests per click.

### A-20 — P3 — Chat textarea has no accessible label

**Evidence:** `components/interact/ChatInput.tsx:85-99`: no `id`/`<label>`, `aria-label` or `aria-labelledby`. Only a placeholder is set, and the placeholder changes with state. (The topic input in `WorkspacePage.tsx:221` has an `id` and label.)
**Impact:** Screen readers announce an unnamed edit field (WCAG 4.1.2 / 1.3.1).

### A-21 — P3 — Dead `KaTeXBlock` with an unsafe fallback

**Evidence:** `components/common/KaTeXBlock.tsx:15-25` injects the **raw input** with `dangerouslySetInnerHTML` if `katex.renderToString` throws. The component is only re-exported (`components/common/index.ts:4`) and never rendered, because math goes through `rehype-katex`.
**Impact:** No current exposure, but it becomes an XSS sink if someone reuses the component with model or user text.

### A-22 — P3 — Inconsistent auth state after a non-401 `/auth/me` failure

**Evidence:** `store/authSlice.ts:213-226`: on network or 5xx failure, the token is kept, `user` stays `null` and `authStatus` becomes `unauthenticated`. `AppRouter.tsx:17-21` only re-fetches when the status is `idle`, so nothing retries. `selectIsGuest` (`authSlice.ts:252-253`) returns `false` because a token exists.
**Impact:** After a brief backend outage at start-up (e.g. a Render cold start), the UI renders as a guest while requests still carry the token. The session list is never loaded until a manual reload.

### A-23 — P3 — Test files compiled into production output

**Evidence:** `apps/server/tsconfig.json` and `packages/shared/tsconfig.json` include `src/**/*`. After the build, `apps/server/dist/__tests__` and `packages/shared/dist/__tests__` exist (observed with `ls`). Server `dist/` also contains the `scripts/`.
**Impact:** Larger deploy artefact. Test-only imports (`supertest`, `mongodb-memory-server` types) end up in the production tree.

### A-24 — P3 — Redundant or unused indexes

**Evidence:** `models/TopicSession.model.ts:302` declares `userId` `index: true`, which duplicates the prefix of `{userId:1, updatedAt:-1}` (`:387`). `{_id:1, userId:1}` (`:388`) is redundant because `_id` is unique. `isGuest` `index: true` (`:307`) is low-cardinality, and no query filters by it without `_id`.
**Impact:** Extra write and storage cost on every session save, with no query benefit.

### A-25 — P3 — Client and server response type mismatches

**Evidence:** `store/sessionSlice.ts:142-150` types `PATCH /sessions/:id/mode` as `{ lastActiveMode }`, but the server returns a full `TopicSessionDTO` (`session.controller.ts:70-84`). `:167-175` types delete as `{ deleted: boolean }`, but the server returns `{ deletedId }` (`session.service.ts:239`).
**Impact:** No runtime bug today, because the fields are unused. The types mislead future changes and the shared package does not enforce the API contract.

### A-26 — P3 — `eval:ai` ignores configured model names

**Evidence:** `scripts/env-preload.ts:3` sets `MENTORA_STANDALONE=true`. `config/env.ts:37-43` then spreads `TEST_ENV_DEFAULTS` **over** `process.env`, which forces `GEMINI_FAST_MODEL`/`GEMINI_REASONING_MODEL` to the hard-coded test values. Only the API key is read separately (`eval-ai.ts:485,776`).
**Impact:** The evaluation benchmarks models other than the ones configured in `.env`, so its results may not reflect production.

### A-27 — P3 — Repeated logic

**Evidence:** `extractSessionId` is copied in `explain.controller.ts:11-17`, `interact.controller.ts:12-18` and `practice.controller.ts:11-17`. The "load user and assert profile complete → build profile" block appears 4× (`explain.service.ts:65-85, 237-256`, `interact.service.ts:296-311, 352-371`, `practice.service.ts:93-113`). The "quota meta" block appears in 5 controller methods.
**Impact:** Divergence risk; A-06 is an example of the copies already behaving differently.

### A-28 — P3 — Account enumeration

**Evidence:** `services/auth.service.ts:88-94` returns "An account with this email already exists". `:135-137` returns before running bcrypt when the email is unknown, which is measurably faster than the bcrypt-cost-12 path.
**Impact:** Lets an attacker confirm which emails have accounts. Low severity for this product, but cheap to fix.

### A-29 — P3 — Health check ignores DB state

**Evidence:** `controllers/health.controller.ts` always returns `ok`. `render.yaml:8` uses it as `healthCheckPath`.
**Impact:** Render keeps routing traffic to an instance that has lost its Mongo connection.

### A-30 — P3 — Documentation does not describe guest mode

**Evidence:** `grep -i guest README.md docs/*.md` returns no matches, although guest mode is a main feature (`b8b861f`) with its own quota, TTL and UI.
**Impact:** Onboarding and operations docs are wrong about who can access the API.

### A-31 — P3 — Test coverage gaps

**Evidence:** All 361 tests pass, but no test covers: cross-guest isolation (A-01), IP spoofing (A-02), persistence failure after SSE headers (A-04), practice re-submission (A-05), guest charging on idempotent paths (A-06), concurrent quota (A-07) or create-session timeout (A-03). No coverage provider is configured (`vitest.config.mts`, no `@vitest/coverage-*` dependency).
**Impact:** The regressions above went undetected, and coverage cannot be measured.

---

## 5. Test, lint, type-check and build results

All commands were run from the repository root on the audited commit.

| Command | Result |
|---|---|
| `pnpm typecheck` (shared, client, server) | ✅ Pass, no errors |
| `pnpm lint` (`eslint .`) | ✅ Pass, no warnings or errors |
| `pnpm test` (`vitest run`) | ✅ **31 files, 361 tests passed**, 0 failed (45.8 s) |
| `pnpm build` (shared → server → client) | ✅ Pass. ⚠ Vite chunk-size warning: main chunk 1,783.84 kB (566.82 kB gzip), `elk` 1,462.79 kB, `cytoscape` 434.71 kB |

Notes:
- `typecheck` and the server and client tests resolve `@mentora/shared` through its `dist/` output (`packages/shared/package.json` `exports`). `dist/` was already present. On a fresh clone, `pnpm --filter @mentora/shared build` must run first, as the README documents. **Potential:** CI that runs `pnpm typecheck` before a build would fail.
- No dependency vulnerability scan (`pnpm audit`) was run, because it contacts the registry and was out of scope for an offline audit. Run it as part of Phase 5.

## 6. Potential risks and recommended improvements (not confirmed defects)

- **JWT in `localStorage`** (`services/apiClient.ts:35-63`): any future XSS can steal the 7-day token, and the server cannot revoke tokens. The rendering path looks safe today: react-markdown without `rehype-raw`, Mermaid `securityLevel: 'strict'` and KaTeX output. Consider shorter expiry plus refresh, or httpOnly cookies, if the threat model grows.
- **Concurrent writes to one `TopicSession`**: services use read-modify-`save()` on a single large document. Simultaneous actions in two tabs can overwrite each other or raise `VersionError`. Related to A-07.
- **Prompt injection**: learner text is inserted verbatim into prompts (`prompt.builder.ts:316`). The worst outcome today is the learner steering their own Socratic outcome (e.g. forcing `ADVANCE`), so the risk is low. Worth noting if scores ever matter.
- **Mermaid rendering during streaming**: half-finished diagrams in streamed text are re-parsed on every token. This is functionally safe (it falls back to the raw source) but costs CPU. Consider rendering Mermaid only after the stream finishes.
- **Guest session TTL is fixed at creation** (`session.repository.ts:27-29`): an active guest loses their session exactly 2 h after creation, even mid-study. This is a product decision, so confirm it is intended.
- **Interact can continue after completion on the API**: `validateTurnPreconditions` accepts `COMPLETED` (`interact.service.ts:284-294`), while the client disables input. This is harmless but inconsistent.
- **Error-code mapping on the client** (`apiClient.ts:66-87`) maps every 403 to `PROFILE_INCOMPLETE` and every 409 to `TIER_LOCKED` when the envelope is missing. Acceptable now, but fragile if new 403/409 cases are added.

## 7. Overall project health summary

**Overall: good engineering base with a few serious gaps in the newer guest-mode code.**

Strengths:
- Strict TypeScript and a single shared Zod contract between client and server. Type-check, lint, tests and build are all green.
- Clean layering (routes → controllers → services → repositories). The AI layer has validation, a retry guard and refusal handling, and the pure state machine for the Socratic circuit breaker is unit-tested.
- Sensible defaults: helmet, a strict CORS origin, a body-size limit, validated env, pino with redaction, `passwordHash` excluded by default, and answers masked until a batch is completed.

Main concerns:
1. **Guest mode security** (A-01, A-02, A-08): no ownership of guest sessions and a spoofable quota identity. These are the highest-priority fixes.
2. **AI request lifecycle reliability** (A-03, A-04, A-14): timeouts, failures after streaming starts, and cancellation all leave the user and the billing state out of sync.
3. **Quota and billing correctness** (A-06, A-07, A-05).
4. **Efficiency** (A-11, A-12, A-13, A-16): straightforward fixes with no architectural change.

None of the findings needs an architectural rewrite. `IMPLEMENTATION_PLAN.md` sequences the fixes in phases so they can be shipped and verified one phase at a time.
