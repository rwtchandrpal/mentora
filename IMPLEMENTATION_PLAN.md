# Mentora — Implementation Plan

This plan fixes the findings in `PROJECT_AUDIT_REPORT.md` (IDs `A-01` … `A-31`).
Each phase can ship on its own. Do them in order, and finish one phase (all its tasks plus the phase gate) before you start the next.

## Ground rules for every task

1. **Write a failing regression test first**, using the existing harnesses: `supertest` + `mongodb-memory-server` for the server, Testing Library for the client. Then fix the code.
2. Keep the change to the files listed. Don't refactor neighbouring code unless the task asks for it.
3. Shared contract changes go in `packages/shared` first. Then run `pnpm --filter @mentora/shared build` so the server and client pick them up.
4. **Phase gate.** After each phase, run:
   `pnpm --filter @mentora/shared build && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. All of them must pass.
5. Items marked **⚠ Owner decision** change deployment settings, database collections or product behaviour. Get the owner's sign-off before you implement them.

---

## Phase 1 — Guest-mode security (P0/P1)

### T1.1 — Bind guest sessions to an unguessable guest token · `A-01` · **P0**

- **Files:** `packages/shared/src/schemas/api-envelope.schema.ts` (meta), `apps/server/src/services/auth.service.ts` (or a new `services/guest-token.service.ts`), `middlewares/auth.middleware.ts`, `repositories/session.repository.ts`, `services/session.service.ts`, `controllers/session.controller.ts`, `app.ts` (CORS `allowedHeaders`), `apps/client/src/services/apiClient.ts`, `hooks/useSseStream.ts`, `store/sessionSlice.ts`.
- **Approach:** stateless signed token. This needs no schema migration.
  1. When a guest session is created, sign a JWT `{ sid: <sessionId>, typ: 'guest' }` with `JWT_SECRET`. Set its expiry to `GUEST_SESSION_TTL_SECONDS`, and use a different `typ` from user tokens so the two can never be swapped.
  2. Return the token in `meta.guestToken`. Add `guestToken: z.string().optional()` to `ApiResponseMetaSchema`.
  3. Clients send it as `X-Guest-Token`. Add the header to `cors({ allowedHeaders })`.
  4. In `optionalAuth`, when there is no bearer token, verify `X-Guest-Token` and set `req.guest = { sessionId }`.
  5. Pass the verified guest session ID into the repository. Replace the "any `isGuest` doc" checks in `findSession`, `updateLastActiveMode` and `deleteByIdAndUserId` (`session.repository.ts:66-81, 121-135, 156-166`) with a check that `params.id === req.guest.sessionId && isGuest`. Return 404 on a mismatch, so the endpoint doesn't reveal whether the ID exists.
  6. Client: keep a `sessionId → guestToken` map in `sessionStorage`, guarded with try/catch. Attach the token in the axios request interceptor and in the `fetch` call in `useSseStream`.
- **Depends on:** none.
- **Acceptance criteria:**
  - Guest A cannot `GET`, `PATCH /mode`, `DELETE`, or call any `explain` / `interact` / `practice` endpoint on guest B's session. Each attempt returns 404 (or 401 when no token is sent).
  - The guest who created the session keeps full access in the same tab.
  - A user token cannot be used as a guest token, and the other way round.
- **Verification:**
  - New tests in `guest-mode.routes.test.ts`: cross-guest read, write and delete are rejected; requests without a token are rejected; a token for session X is rejected on session Y.
  - Update the existing guest tests to send the token.
  - Update the client `guest-mode.ui.test.tsx` and `apiClient.test.ts` to assert the header is attached.

### T1.2 — Derive the guest identity from `req.ip` only · `A-02` · **P1**

- **Files:** `apps/server/src/middlewares/quota.middleware.ts:40-46`, `__tests__/guest-mode.routes.test.ts`.
- **Approach:** `getGuestIdentifier` returns `req.ip ?? req.socket.remoteAddress ?? 'unknown-guest'`. Express already resolves `req.ip` with `trust proxy = 1` (`app.ts:18`), so stop parsing `X-Forwarded-For` by hand. Add a comment stating that `trust proxy` must equal the number of proxy hops on Render.
- **Depends on:** none. Do it alongside T1.3.
- **Acceptance criteria:**
  - Changing the left-most `X-Forwarded-For` value doesn't reset the guest quota.
  - Two requests from the same real IP share one counter.
- **Verification:** a new test sends 16 guest AI requests, each with a different spoofed left-most XFF value and the same proxy-appended right-most value, and expects the 16th to return 429.

### T1.3 — Bounded, restart-safe guest quota store · `A-08` (also closes the guest half of `A-07`) · **P2, grouped here because T1.2 depends on it for abuse resistance**

- **Files:** `middlewares/quota.middleware.ts`. Option A also adds `models/GuestQuota.model.ts` and `repositories/guestQuota.repository.ts`.
- **Approach (⚠ Owner decision, choose one):**
  - **Option A (recommended): MongoDB collection.** Store `{ _id: guestId, count, windowResetAt }` with a TTL index on `windowResetAt`. Use one atomic `findOneAndUpdate` with `upsert` and `$inc`, filtered on `count < limit`, to reserve quota. This survives restarts, works across instances, and removes the race.
  - **Option B (minimal):** keep the `Map`, but add a periodic sweep (`setInterval(...).unref()`) that removes expired entries, plus a hard cap on the number of entries (evict the oldest).
- **Depends on:** T1.2.
- **Acceptance criteria:**
  - Expired guest entries are removed.
  - Option A: quota persists across a server restart.
  - The `clearGuestQuotaStore` test helper still works.
- **Verification:** unit tests for expiry and cleanup, plus the existing guest quota 429 test.

**Phase 1 gate:** full command set, plus a manual check: open the same guest session URL in two browsers. The second browser must be denied.

---

## Phase 2 — AI request lifecycle reliability (P1)

### T2.1 — Align client timeouts with server AI work · `A-03` · **P1**

- **Files:** `apps/client/src/store/sessionSlice.ts:95-104` (and the other AI thunks for consistency), optionally `apps/client/src/config/` for timeout constants.
- **Approach:**
  1. Add named constants, for example `AI_FAST_TIMEOUT_MS = 45_000` and `AI_REASONING_TIMEOUT_MS = 90_000`. The server's worst case is 2 attempts plus a 2 s back-off. Use them in every AI thunk.
  2. `createSessionThunk` picks the timeout from `initialMode`: reasoning for `practice`, fast for the other modes.
  3. Optional follow-up: create with `autoInitialize: false` and let the stage component call the mode `init` thunk. This keeps the create call fast and reuses the existing loading skeletons. Do this only if the owner prefers it, because it changes the request flow.
- **Depends on:** none.
- **Acceptance criteria:**
  - Creating a Practice session doesn't show a timeout error while the server is still generating.
  - All AI thunks use the shared constants. No AI thunk uses the 15 s default.
- **Verification:** a client unit test asserts that `apiClient.post` receives the expected `timeout` for each mode (mock `apiClient`, following the pattern in `apiClient.test.ts` / `store.slices.test.ts`).

### T2.2 — Report failures after SSE headers are sent · `A-04` · **P1**

- **Files:** `apps/server/src/services/interact.service.ts:529-596`, `controllers/interact.controller.ts:48-73`, `middlewares/error.middleware.ts`.
- **Approach:**
  1. In `processTurnStream`, wrap everything after streaming (state transition, `save`, quota increment, metadata) in `try/catch`. On error, log it and call `sseWriter.sendError({ code: AI_UPSTREAM_FAILURE | INTERNAL_SERVER_ERROR, message: <generic> })`, then return.
  2. Guard against an empty assistant reply. If `accumulatedAssistantText.trim()` is empty, send an `error` event ("The tutor returned an empty response, please retry"), skip persistence and don't charge quota.
  3. Defensive fix in `errorMiddleware`: if `res.headersSent`, log the error and `res.end()` (or delegate to `next(err)`). Never call `res.status().json()`.
- **Depends on:** none. T2.3 touches the same function, so do T2.2 first.
- **Acceptance criteria:**
  - When `save()` fails, the client receives an SSE `error` event and the UI shows the retry banner.
  - No `ERR_HTTP_HEADERS_SENT` appears in the logs.
  - Session state is unchanged after the failure.
- **Verification:**
  - `interact.e2e.test.ts`: mock `streamContent` to yield only `<<MENTORA_STATE:{"outcome":"STRIKE"}>>`, and assert an `error` frame, no `metadata`, and unchanged DB state.
  - A second test stubs `sessionRepo.save` to reject and asserts an `error` frame.
  - Unit test for `errorMiddleware` with `headersSent = true`.

### T2.3 — Cancel the upstream stream on client disconnect · `A-14` · **P2 (lifecycle group)**

- **Files:** `utils/sse.helper.ts`, `ai/gemini.client.ts` (`streamContent`), `services/interact.service.ts`.
- **Approach:**
  1. `SseWriter` exposes an `AbortSignal` that fires on `res` `'close'` before `finish`.
  2. Pass it to `streamContent` and on to `generateContentStream` (`config.abortSignal`; check the installed `@google/genai` typings).
  3. In `processTurnStream`, if the signal fired, return without persisting or charging quota.
- **Depends on:** T2.2.
- **Acceptance criteria:**
  - Aborting from the client (the `abortStream` button, or navigating away) leaves no new messages in the session and doesn't increment quota.
- **Verification:** an e2e test that closes the request mid-stream (supertest `.abort()`, or a raw `http` client) and asserts the message count and quota are unchanged. The test uses a mocked generator that yields slowly.

**Phase 2 gate:** full command set, plus a manual check: create a session in each mode against a real Gemini key, and cancel one Interact turn mid-stream.

---

## Phase 3 — Quota, billing and business-rule correctness (P2)

### T3.1 — Reject re-submission of completed practice batches · `A-05`

- **Files:** `apps/server/src/services/practice.service.ts:202-221`.
- **Approach:** if `batch.status === BatchStatus.COMPLETED`, throw `AppError(409, VALIDATION_ERROR, 'This batch has already been submitted.')`. Reuse an existing `ErrorCode`, because adding a new code changes the shared enum. Check that the client's `PracticeStage` never submits a completed batch.
- **Depends on:** none.
- **Acceptance criteria:** a second submit returns 409, and the stored `score` and `userAnswers` are unchanged.
- **Verification:** new test in `practice.service.test.ts` and `practice.e2e.test.ts`.

### T3.2 — Charge guests only when AI work actually ran · `A-06` (also resolves part of `A-27`)

- **Files:** `services/explain.service.ts`, `services/interact.service.ts`, `services/practice.service.ts`, `services/session.service.ts`, and all four AI controllers.
- **Approach:**
  1. Services return `{ session, quota?: QuotaMetaDTO }`. Charging happens inside the service, at the same point for users and guests, through one helper `chargeQuota({ userId, guestId })`. That helper calls `incrementUserQuota` or `incrementGuestQuota` (or the Option A repository from T1.3).
  2. Controllers only forward `result.quota ?? req.quota`.
  3. `createSession` with `autoInitialize === false` doesn't charge.
- **Depends on:** T1.3 (the guest store API).
- **Acceptance criteria:**
  - Idempotent `explain/init`, `interact/init` and `practice/generate` return results without charging guests.
  - Guest charging matches user charging for every endpoint.
- **Verification:**
  - Extend `guest-mode.routes.test.ts`: call `init` twice and expect `used` to increase by 1.
  - Create with `autoInitialize:false` and expect `used` unchanged.
  - Existing user quota tests must still pass.

### T3.3 — Atomic quota reservation and concurrent-generation guard · `A-07`

- **Files:** `repositories/user.repository.ts`, `middlewares/quota.middleware.ts`, the AI services.
- **Approach:**
  1. Add `userRepository.tryReserveQuota(userId, limit)`: a single `findOneAndUpdate({ _id, 'usageQuota.dailyCount': { $lt: limit } }, { $inc: 1 })` that runs after the window sync. If it returns `null`, respond with 429.
  2. Add `releaseQuota(userId)` (`$inc: -1`, floored at 0). Services call it when generation fails or when the idempotent path is taken. This keeps the "charge only on success" rule. Use the same pattern for guests (T1.3 Option A).
  3. Concurrent `init`: before calling Gemini, check again with a conditional update (e.g. `explainState.status: NOT_STARTED → set a 'generating' marker`), or after generation save with `findOneAndUpdate` filtered on `status != READY`. If this request lost the race, return the winning document and release the reservation.
     ⚠ Owner decision: adding a `generating` status changes the shared enum. Prefer the filtered-save variant if enum changes are unwanted.
- **Depends on:** T3.2.
- **Acceptance criteria:**
  - N parallel AI requests at `limit-1` produce exactly one success and N−1 responses of 429.
  - Two parallel `explain/init` calls produce one Gemini call (or one billed call) and identical results.
- **Verification:** new concurrency tests in `quota.middleware.test.ts` and `explain.e2e.test.ts` using `Promise.all`, with a mocked Gemini client that counts calls.

### T3.4 — Recover from expired tokens on the client · `A-09`, `A-22`

- **Files:** `apps/client/src/services/apiClient.ts`, `store/index.ts` (handler registration), `store/authSlice.ts`, `routes/AppRouter.tsx`, `hooks/useSseStream.ts`.
- **Approach:**
  1. Add `setUnauthorizedHandler(fn)` in `apiClient.ts`. The response interceptor calls it when a token was sent and the response is 401 `UNAUTHORIZED`. `store/index.ts` registers `() => store.dispatch(logout())`, which avoids a circular import.
  2. `useSseStream` does the same for a non-OK 401 response.
  3. After `logout`, the app keeps working in guest mode, or the guards redirect to `/login`. Keep the current guard behaviour.
  4. A-22: on a non-401 `fetchMe` failure, set `authStatus` back to `'idle'` and add a retry (a "Retry" button, or one automatic retry with back-off). Don't leave the app in a half-authenticated state.
- **Depends on:** none. Keep server `optionalAuth` semantics unchanged, so an expired token must not silently become a guest.
- **Acceptance criteria:**
  - With an expired token, the first failing request logs the user out and the UI recovers without a manual reload.
  - A 5xx on `/auth/me` doesn't leave `token != null && user == null && status == 'unauthenticated'`.
- **Verification:** client tests in `apiClient.test.ts` (interceptor calls the handler) and `auth-onboarding.test.tsx` (state after a 401 and after a 500).

### T3.5 — Align deployment model config · `A-10` · **⚠ Owner decision (deployment setting)**

- **Files:** `render.yaml:26-27`, `apps/server/.env.example:25`, `README.md` (env section).
- **Approach:** decide which reasoning model is intended. If it is the commit `1e13d24` intent, set `GEMINI_REASONING_MODEL` to `gemini-3.5-flash-lite` in `render.yaml` and `.env.example`, or remove the explicit value so the code default applies. Also update the Render dashboard if the value was set there manually.
- **Depends on:** none.
- **Acceptance criteria:** the code default, the example env file and the deploy config name the same model, and that model is documented.
- **Verification:** `deployment-artifacts.test.ts` already parses deploy files. Add an assertion that `render.yaml` and `.env.example` agree with the documented model.

**Phase 3 gate:** full command set.

---

## Phase 4 — Performance and efficiency (P2)

### T4.1 — Bound the Interact prompt history · `A-11`

- **Files:** `packages/shared/src/constants/index.ts` (new `MAX_INTERACT_PROMPT_HISTORY`, e.g. 20 messages), `services/interact.service.ts:479-482`.
- **Approach:** send only the last N messages to `buildInteractTurnPrompt`. The milestone roadmap already carries long-range context. Optionally add `MAX_INTERACT_MESSAGES_PER_SESSION` (e.g. 400) and return 400 with a friendly message when it is exceeded (⚠ product decision).
- **Depends on:** Phase 2 (same file).
- **Acceptance criteria:** with 100 stored messages, the prompt contains exactly N history lines.
- **Verification:** unit test on `PromptBuilder` / `processTurnStream` with a spied `streamContent` that captures the prompt.

### T4.2 — Lightweight session list query · `A-12`

- **Files:** `repositories/session.repository.ts:83-92`, `services/session.service.ts:76-89` (accept a lean object).
- **Approach:** `.select('topicQuery normalizedTitle lastActiveMode createdAt updatedAt').lean()`. Adjust the `toSessionSummaryDTO` input type. Pagination (`?limit&cursor`) is optional, and only worth adding if session counts grow (⚠ API change).
- **Depends on:** none.
- **Acceptance criteria:** the response is identical to the current one (the snapshot from `session.routes.test.ts` still passes), and the query no longer loads mode states.
- **Verification:** existing list tests, plus a repository test asserting the returned docs have no `explainState`.

### T4.3 — Single router mount and fewer `User` lookups · `A-13`

- **Files:** `apps/server/src/app.ts:53-55`, `routes/explain.routes.ts`, `interact.routes.ts`, `practice.routes.ts`, `middlewares/auth.middleware.ts`, `middlewares/quota.middleware.ts`, the AI controllers and services.
- **Approach:**
  1. Remove the unreachable app-level mounts (`app.ts:53-55`).
  2. Remove `.use(optionalAuth, requireCompletedProfile)` from the three mode routers, because they inherit it from `sessionRouter`. First check with `grep -rn "explainRouter\|interactRouter\|practiceRouter" apps/server/src/__tests__` that no test mounts them standalone. At audit time, none did.
  3. In `optionalAuth`/`requireAuth`, attach the loaded document as `req.userDoc`. Services take the profile from the caller instead of calling `findById` again. Controllers use the quota returned by the service (T3.2) instead of re-reading the user.
- **Depends on:** T3.2 (the quota return shape).
- **Acceptance criteria:**
  - Every route keeps the same behaviour and middleware order (all route tests pass).
  - An AI request performs at most 2 `User` queries (auth plus the quota reserve).
- **Verification:** the existing suites, plus a test using `mongoose.set('debug', fn)` or a spy on `User.findById` that counts queries for one `explain/init`.

### T4.4 — Code-split Mermaid · `A-16`

- **Files:** `apps/client/src/components/common/MermaidDiagram.tsx`, optionally `vite.config.ts`.
- **Approach:** replace `import mermaid from 'mermaid'` with a cached `await import('mermaid')` inside the effect. Keep `initialize` once per module. Optionally lazy-load `RichMarkdownRenderer` for the auth pages.
- **Depends on:** none.
- **Acceptance criteria:** the main entry chunk shrinks substantially (target < 600 kB minified), and diagrams still render and still fall back on invalid syntax.
- **Verification:** compare `pnpm --filter @mentora/client build` output before and after. Run `RichMarkdownRenderer.test.tsx`, which may need an async `findBy*` for the Mermaid assertions.

### T4.5 — Dedicated auth rate limiter · `A-15`

- **Files:** `apps/server/src/routes/auth.routes.ts` (or `app.ts`).
- **Approach:** add an `express-rate-limit` instance, e.g. 10 requests per 15 min keyed by `req.ip + normalized email`, with `skip` in test like the global limiter. Apply it to `/login` and `/register` only. Reuse the 429 envelope shape.
- **Depends on:** none.
- **Acceptance criteria:** the 11th login attempt for the same email and IP within the window returns 429 `RATE_LIMIT_EXCEEDED`, and other routes are unaffected.
- **Verification:** an `auth-profile.routes.test.ts` case. Enable the limiter in that test by creating an app with an injected limit, because `env.NODE_ENV === 'test'` skips limiters today.

**Phase 4 gate:** full command set, plus bundle size recorded in the PR description.

---

## Phase 5 — Low-priority hygiene (P3)

Each task here is independent and small. Group them into one or two PRs.

| Task | Ref | Files | Approach | Acceptance / verification |
|---|---|---|---|---|
| T5.1 | A-17 | `ai/gemini.client.ts:254-262, 313-321`, `services/interact.service.ts:521-525` | Keep `cause` in logs only. Send clients a generic message (and `operation` at most). | Error responses contain no SDK or Zod text. Update the `ai.structured-runner.test.ts` expectations. |
| T5.2 | A-18 | `components/layout/LeftHistorySidebar.tsx:54-64` | Check `deleteSessionThunk.fulfilled.match(result)` before clearing and navigating. Otherwise keep the session open (the slice already records the error). | Client test with a rejected delete: the active session stays open. |
| T5.3 | A-19 | `LeftHistorySidebar.tsx:50-51` | Only `navigate()`. Let `WorkspacePage` fetch the session. | Test: one `GET /sessions/:id` per click. |
| T5.4 | A-20 | `components/interact/ChatInput.tsx:85` | Add `aria-label="Your response to Mentora"`, or a visually hidden `<label>`. | Testing Library `getByRole('textbox', { name: … })` passes. |
| T5.5 | A-21 | `components/common/KaTeXBlock.tsx`, `components/common/index.ts` | Delete the unused component and its export, or escape the fallback text and render it as plain text. | Grep shows no unsafe fallback. Tests and build pass. |
| T5.6 | A-23 | `apps/server/tsconfig.json`, `packages/shared/tsconfig.json` (add `tsconfig.build.json` with `exclude: ["src/**/__tests__/**", "src/scripts/**"]` for the server; keep `typecheck` covering tests) | Build scripts use the build config. | After `pnpm build`, `dist/__tests__` is absent. `pnpm start` still works. The `eval:ai` script runs via `tsx`, so it is unaffected. |
| T5.7 | A-24 | `models/TopicSession.model.ts:302,307,388` | Remove `index: true` on `userId` and `isGuest`, and the `{_id, userId}` index. ⚠ Existing Atlas indexes must be dropped manually (owner operation). | `repositories.test.ts` passes. `syncIndexes()` in a scratch DB shows the expected set. |
| T5.8 | A-25 | `store/sessionSlice.ts:142-175` | Type the responses as `TopicSessionDTO` and `{ deletedId: string }`. Optionally use the server response to refresh `activeSession`. | Typecheck passes. Slice tests pass. |
| T5.9 | A-26 | `config/env.ts:37-43` | In standalone mode, spread `process.env` **after** the defaults (`{...TEST_ENV_DEFAULTS, ...process.env}`), so real values win and defaults only fill gaps. Keep test mode as it is. | `eval-ai.script.test.ts` passes. A manual `eval:ai --dry-run` prints the configured model names. |
| T5.10 | A-27 | controllers and services | Extract `extractSessionId` into `utils/request.ts`, and `resolveLearnerProfile(userId)` into one helper. Do this only after T3.2 and T4.3, so they are not duplicated. | No behaviour change. All tests pass. |
| T5.11 | A-28 | `services/auth.service.ts:88-94, 132-142` | Always run `bcrypt.compare` against a constant dummy hash when the user is missing. Leave the register message as is (⚠ product UX decision). | Login timing is similar for unknown and known emails (spot check). Existing auth tests pass. |
| T5.12 | A-29 | `controllers/health.controller.ts` | Include `db: mongoose.connection.readyState === 1`, and return 503 when the DB is down. Keep `/health` cheap. | `app.health-error.test.ts` gets a disconnected-DB case. |
| T5.13 | A-30 | `README.md`, `docs/architecture.md` | Document guest mode: endpoints, guest token (after T1.1), quota 15 per day, 2 h TTL, and limits. | Doc review. |
| T5.14 | A-31 | `vitest.config.mts`, root `package.json` | ⚠ Adds a dev dependency (`@vitest/coverage-v8`), which needs owner approval. Add a `test:coverage` script. | `pnpm test:coverage` produces a report. Record the baseline in the PR. |
| T5.15 | §5 note | CI / scripts | Make `typecheck` build shared first (e.g. `"typecheck": "pnpm --filter @mentora/shared build && pnpm -r typecheck"`), or document the requirement in CI. Run `pnpm audit` and triage the results. | A fresh clone passes `pnpm install && pnpm typecheck`. |

**Phase 5 gate:** full command set.

---

## Dependency overview

```
Phase 1: T1.1 ─┐
         T1.2 ──▶ T1.3 ─────────────┐
Phase 2: T2.1   T2.2 ──▶ T2.3       │
Phase 3: T3.1   T3.2 ◀──────────────┘ ──▶ T3.3     T3.4   T3.5
Phase 4: T4.1 (after Phase 2)  T4.2   T4.3 (after T3.2)  T4.4  T4.5
Phase 5: independent. T5.10 after T3.2 and T4.3.
```

## Suggested session breakdown (for follow-up Claude Code sessions)

1. **Session A**: Phase 1 (T1.1–T1.3). The security fix; land it first.
2. **Session B**: Phase 2 (T2.1–T2.3).
3. **Session C**: Phase 3 (T3.1–T3.5). Settle the T3.3 and T3.5 owner decisions beforehand.
4. **Session D**: Phase 4 (T4.1–T4.5).
5. **Session E**: Phase 5 hygiene batch.

Start each session by re-running the baseline (`pnpm test` should report 361/361 passing at this audit's commit, plus any tests earlier phases added). End it by running the phase gate.
