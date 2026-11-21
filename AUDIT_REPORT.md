# Mentora — Pre-Release Audit Report

**Audit date:** 2026-11-21
**Branch / commit:** `fix/phase2-backend-correctness` @ `209a683` (working tree clean)
**Scope:** `packages/shared`, `apps/server`, `apps/client`, root configs, `render.yaml`, `apps/client/vercel.json`, `docs/*.md`, `README.md`, `.env.example` files, full git history (52 commits) for secrets.
**Method:** Static review of all non-test source files, contract tracing shared → server → client, git-history secret scan, and the four verification gates run from the repo root. No source, test, or config files were modified.

> **Not covered:** The UI was **not** run in a real browser for this audit. Mobile layout (360px), console warnings and keyboard flow were checked by reading the code and the jsdom test suite only. Live Gemini / Atlas / Render / Vercel behaviour was not exercised.

---

## 1. Executive Summary & Release Readiness Verdict

### Verdict: **Needs Minor Polish**

The codebase is in good shape for a public release. All four gates pass with zero errors. No secrets were found in the tree or in git history. Tenant isolation, guest isolation, quota reservation and Practice answer-key masking all hold up under review. There are **no Critical/Blocker findings**.

Fix the **4 High** findings before the next production redeploy. Two are deployment reproducibility risks: a fresh clone deployed with the committed configs will probably fail to build. One is a visible Interact-mode UX bug, and one is a public-docs inaccuracy about Guest Mode. The Medium and Low items are polish and cleanup.

| Severity | Count |
| :--- | :---: |
| Critical / Blocker | 0 |
| High | 3 (+ H-01, downgraded to Low after verification) |
| Medium | 9 |
| Low / Cleanup | 14 |

### Remediation status (updated 2026-11-21)

| Item | Status | Notes |
| :--- | :--- | :--- |
| **H-01 / FIX-001** | **Corrected → Low; hardening applied** | Reproduced in a clean clone: with the pinned `pnpm@12.15.0`, `NODE_ENV=production pnpm install --frozen-lockfile` **still installs devDependencies**, and the shared and server builds succeed. The original claim was wrong for the pinned version. `--prod=false` was still added to `render.yaml`, because older pnpm versions (which Render may use if it ignores `packageManager`) do skip devDependencies under `NODE_ENV=production`. A test asserts the flag. |
| **H-02 / FIX-002** | **Fixed** | Confirmed in a clean clone: the old default `pnpm build` in `apps/client` failed with `TS2307: Cannot find module '@mentora/shared'`. `vercel.json` now has `installCommand`, `buildCommand` (shared → client) and `outputDirectory`, and the new commands produce `dist/index.html`. README §6 documents Render/Vercel setup and the CSP `connect-src` edit (which also documents M-03). A test asserts the build order. |
| **H-03 / FIX-003** | **Fixed** | The `start` frame now dispatches a new `setActiveTurnId` reducer instead of `startStreaming`, so the learner's message stays visible while the reply streams. Also fixed two related paths found while fixing it: an SSE `error` frame no longer clears the message (the post-loop cleanup used to wipe it), and a stream that closes without `done`/`error` now shows the retryable "Connection interrupted" error instead of silently dropping the turn. Three new `InteractStage` tests (all three fail on the old code) and one slice test. |
| **H-04 / FIX-004** | **Fixed** | `README.md` and `docs/architecture.md` now describe `localStorage` (`mentora_guest_tokens`), pruning of expired tokens, and browser-scoped access. |
| Gates after High fixes | `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ 35 files / **428** tests · `pnpm build` ✅ | Render and Vercel were not redeployed; the build commands were reproduced locally in clean clones. |
| **M-01 / FIX-005** | **Fixed** | `validateTurnPreconditions` returns `409 CONFLICT` for a `completed` Interact session before SSE opens. The reserved quota unit is released, and the status can no longer regress to `active`. A new e2e test (fails on the old code with `200`) checks the JSON 409, that Gemini is not called, that status and messages are unchanged, and that quota is unchanged. |
| **M-02 / FIX-006** | **Fixed** | `RATE_LIMIT_EXCEEDED` is added to the shared `ErrorCode`/`ERROR_CODES`. The limiter uses the enum and is typed as `ApiErrorEnvelope`, and the limiter test now checks `ApiErrorEnvelopeSchema`. |
| **M-03** | **Documented** | README §6 (High-fix commit) tells deployers to replace the `connect-src` origin. A build-time CSP was not pursued. |
| **M-04 / FIX-010** | **Configurable; production check still needed** | The hop count is now the `TRUST_PROXY` env var (default `1`, Zod-validated 0–10), documented in `.env.example`, README and architecture §D.4. Tests cover parsing and the `X-Forwarded-For` → `req.ip` resolution. **Still to do:** confirm on Render that `req.ip` is the real client IP, and raise `TRUST_PROXY` if it shows a proxy address. |
| **M-05 / FIX-008** | **Fixed (different approach)** | A narrower regex would have broken the intended L-06 behavior (existing tests require scrubbing "a stray strike mention" and "strike-free"). Instead, the scrubber is now **topic-aware**: a term is left alone when it appears in the session's topic, title or milestone text, and is still scrubbed everywhere else. Added 3 parser tests and 1 e2e test ("lightning strikes" streams unchanged). |
| **M-06** | **Investigated → downgraded to Low, no change** | Sourcemap attribution of the entry chunk: react-dom ≈620 kB, react-router ≈367 kB, zod ≈362 kB, axios ≈190 kB, RTK/immer/react-redux ≈160 kB (unminified source); app pages are only ≈27 kB. Lazy-loading auth pages would save almost nothing. The >500 kB warnings are for the already-lazy workspace and Mermaid `elk` chunks. The entry size (150 kB gzip) is framework baseline. |
| **M-07** | **Fixed** | Regression tests were added for each item above, plus the H-03 tests. |
| **M-08 / FIX-007** | **Fixed** | `submitBatch` now writes through `setIfMatches({ status: 'in_progress' })`; the loser of a race gets `409 CONFLICT` (also resolves L-06: "already submitted" now uses `CONFLICT`, not `VALIDATION_ERROR`). A new concurrency test fails on the old code (both submissions were accepted). |
| **M-09 / FIX-011 (part)** | **Fixed** | `architecture.md`: `topicQuery` body, `/explain/step`, a route table with the "(JWT + Profile) or Guest†" column and footnote, `GET /sessions` users-only, and the new 409 / `RATE_LIMIT_EXCEEDED` behaviours. |
| Gates after Medium fixes | `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ 35 files / **436** tests · `pnpm build` ✅ | |
| **L-01 / L-02** | **Fixed** | Removed `incrementUserQuota` (middleware), `incrementQuotaCount`/`incrementUserQuota` (repository; its test now uses `tryReserveQuota`), the `authMiddleware`/`profileCompletedMiddleware` aliases, `findGuestSessionById`, the `TopicSessionModel` value re-export, `ApiSuccessEnvelopeSchema`, and the three `*_WORKSPACE_READY` sentinels. **Kept** `incrementGuestQuota` and `clearGuestQuotaStore`: they are the fixtures for the guest-quota window tests. |
| **L-03 / L-14** | **Fixed** | Removed the `DeepDiveSubCard` and "deep-dives" mentions. AGENTS.md and implementation_plan.md now give their real `docs/` location and drop the `product_requirement.md` alias. Changed the plan's model to `gemini-3.5-flash-lite`. The architecture §B.2 tree shows `docs/`. `z.ZodIssueCode.custom` → `'custom'` (12 places). AGENTS.md §F and architecture §C name the real middleware chain (`requireAuth`/`optionalAuth` → `requireCompletedProfile` → `requireSessionAccess` → `quotaMiddleware` → `validateRequest`). |
| **L-04 / L-05** | **Fixed** | `ExplainStepRequestSchema` is `{ stepIndex }` only. `/explain/step` returns `409 CONFLICT` until Explain is `ready`. One existing quota test stepped through an uninitialised session; it now marks the session ready first, keeping its intent (quota doesn't block `/step`). New 409 test added. |
| **L-06** | **Fixed** (with M-08) | |
| **L-07** | **Fixed** | Removed the card-4 Q/A fabrication. A missing `checkQuestion`/`checkAnswer` now fails Zod and takes the single retry, then `502`. Two new runner tests. |
| **L-08** | **Fixed** | The sanitizer normalises asymmetric nodes `A>label]` and bracketed edge-label text before balancing. Also closed a pre-existing gap: an odd number of `\|` on a flowchart line (a cut-off edge label) is rejected; class diagrams are exempt because of `<\|--`. New tests cover sequence-diagram arrows too. |
| **L-09** | **Fixed** | The controller passes the validated `{ session, profile }` into `processTurnStream`; a test asserts one `findSession` call per turn. |
| **L-10** | **Deferred** | Capping persisted Interact messages changes what learners can scroll back to. It's a product decision with negligible near-term risk (16 MB per session). |
| **L-11** | **Fixed** | SSE transport failures always show "Connection interrupted. Your progress on this milestone was preserved."; the recovery test asserts the raw "Failed to fetch" text is not shown. |
| **L-12** | **Fixed** | New `utils/quizDraftStorage.ts` with `clearQuizDrafts`. Logout clears all drafts and session delete clears that session's drafts. New test file `quizDraftStorage.test.ts`. |
| **L-13** | **Fixed** | `.gitignore` adds `*.tsbuildinfo`, `.vscode/`, `.idea/`, `.claude/settings.local.json`. |
| Gates after Low fixes | `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ 36 files / **445** tests · `pnpm build` ✅ | Remaining open items: verify `TRUST_PROXY` on Render (M-04); L-10 deferred. |

### Verification gate outputs (run from repo root, in sequence)

**`pnpm typecheck`** — exit 0
```
$ pnpm --filter @mentora/shared build && pnpm -r typecheck
$ node -e "require('fs').rmSync('dist',{recursive:true,force:true})" && tsc -p tsconfig.build.json
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
apps/server typecheck$ tsc --noEmit
apps/client typecheck$ tsc --noEmit
apps/client typecheck: Done
apps/server typecheck: Done
```

**`pnpm lint`** — exit 0, no warnings
```
$ eslint .
```

**`pnpm test`** — exit 0
```
$ vitest run --passWithNoTests
 RUN  v4.1.12 D:/projects/mentora
 Test Files  35 passed (35)
      Tests  423 passed (423)
   Duration  72.15s
```
No skipped (`.skip`/`.todo`) tests.

**`pnpm build`** — exit 0, one warning
```
$ pnpm --filter @mentora/shared build && pnpm --filter @mentora/server build && pnpm --filter @mentora/client build
vite v8.3.5 building client environment for production...
✓ 3214 modules transformed.
dist/assets/index-Dv-vEBbV.js          486.69 kB │ gzip: 150.48 kB
dist/assets/WorkspacePage-BHdhUwmJ.js  602.42 kB │ gzip: 172.78 kB
dist/assets/chunk-NGNAAXSQ-Bw6tHVuc.js 629.04 kB │ gzip: 127.32 kB
dist/assets/elk-QONTBCTQ-DAcJoXjr.js 1,462.87 kB │ gzip: 455.88 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 8.97s
```

### Type-safety scan
- `strict`, `noImplicitAny`, `noUncheckedIndexedAccess` on in `tsconfig.base.json`; `@typescript-eslint/no-explicit-any: error`.
- **Zero** `any`, `@ts-ignore`, `@ts-expect-error` in source.
- 3 justified `eslint-disable-next-line` (Express global augmentation ×2, unused `_next` in error middleware).
- 1 unsafe cast in source: `apps/client/src/store/index.ts:23` (`preloadedState as unknown as undefined`), which is test-only plumbing. Every other `as unknown as` is in test mocks.

---

## 2. Inventory of Current Implemented Features

**Stack:** pnpm monorepo, Node ≥20, TypeScript 6, Express 5 + Mongoose 9 + `@google/genai`, React 19 + Redux Toolkit + Vite 8 + Tailwind 3, Vitest 4.

| Area | What it does today |
| :--- | :--- |
| **Auth & onboarding** | Register / login (bcrypt cost 12, timing-equalised login, 409 on duplicate email), JWT HS256 (7d), `GET /auth/me`, `PUT /profile` (education level + explanation style). Route guards: `ProtectedRoute`, `OnboardingGuard`, `PublicOnlyGuard`. 401 on a bearer request triggers global logout. |
| **Sessions** | Create (auto-initialises the chosen mode), list (summary projection only), get, switch mode, delete. All user queries scoped by `{ _id, userId }`. |
| **Explain** | One structured Gemini call produces exactly 4 cards (intuition → core mechanism → example → check-for-understanding). Step progression is persisted and costs no quota. Incomplete Mermaid blocks are stripped server-side; the client falls back to a code block on Mermaid parse errors. |
| **Interact** | 3–5 milestone roadmap + opening question; Socratic turns stream over SSE (`start`/`token`/`metadata`/`done`/`error`, 15 s heartbeat, `X-Accel-Buffering: no`). Deterministic 3-strike circuit breaker, manual "explain directly" escape hatch, `OFF_TOPIC` outcome (no strike), control-header parser, client-disconnect abort (turn discarded, quota released), manual retry. |
| **Practice** | Reasoning-first 10-MCQ batches per tier (easy → medium → hard sequential unlock), answer key masked until `completed`, deterministic grading, re-submission blocked, `localStorage` draft persistence per session/tier. |
| **Quota** | Atomic reserve → commit/release model (charged only when AI work is saved). 50/day users, 15/day guests (MongoDB `guestquotas`, IP-keyed, TTL). Idempotent re-inits release the unit. |
| **Security** | Helmet, single-origin CORS, global API limiter (100 / 15 min / IP), auth limiter (10 / 15 min / IP+email), 100 kB JSON limit, generic 5xx messages, Vercel CSP + security headers. |
| **Ops** | `/api/v1/health` (200 / 503 on DB state), graceful shutdown, Pino logging, `render.yaml`, `vercel.json`, client cold-start health ping, offline `eval:ai` harness. |

**Intentional evolutions beyond `requirement.md` v1.0** (treated as source of truth):
1. **Guest Mode** (`architecture.md` §D.4): unauthenticated sessions with a 2 h TTL, a per-session guest JWT sent as `X-Guest-Token` (REST + SSE), a 15/day IP quota and `DEFAULT_GUEST_PROFILE`.
2. **Go Deeper / sub-topic chips removed.** No route, schema field or component remains. Tests assert absence (`ExplainStage.test.tsx:630`, `explain.e2e.test.ts:223`). AC-EXP-03 is marked retired.
3. **Default model routing**: both slots now default to `gemini-3.5-flash-lite` (code, `.env.example`, `render.yaml`, README agree; a test enforces it).
4. **`OFF_TOPIC` Socratic outcome** and internal-terminology scrubbing (L-06).
5. Demo account / demo helpers removed (asserted absent in `auth-onboarding.test.tsx:487`).

---

## 3. Findings Log

### Critical / Blocker

_None._

### High

| ID | Category | File(s) & Line(s) |
| :--- | :--- | :--- |
| **H-01** | Deployment | `render.yaml:6`, `render.yaml:11-12` |

**Description:** `NODE_ENV=production` is set as a service env var, and Render exposes env vars during the build. The build then runs `pnpm install --frozen-lockfile`, and pnpm skips `devDependencies` when `NODE_ENV=production`. `typescript` (root) and `@types/*` are devDependencies, so `tsc -p tsconfig.build.json` for `@mentora/shared` / `@mentora/server` will most likely fail with `tsc: not found` on a fresh Blueprint deploy. The current live service may be working because of a dashboard override; the committed file is what external developers will use.
**Expected:** A fresh `render.yaml` Blueprint deploy builds successfully. **Actual:** The build most likely fails at the first `tsc`. Needs confirming on Render.
> **Correction (verified after the audit):** This does not reproduce with the pinned `pnpm@12.15.0`, which installs devDependencies even with `NODE_ENV=production`. It only applies if Render runs an older pnpm. Downgraded to Low; hardened anyway (see Remediation status).

| ID | Category | File(s) & Line(s) |
| :--- | :--- | :--- |
| **H-02** | Deployment | `apps/client/vercel.json` (no `buildCommand`/`installCommand`), `apps/client/package.json` (`build: tsc --noEmit && vite build`), `packages/shared/package.json` (`main: ./dist/index.js`) |

**Description:** The client imports `@mentora/shared`, which resolves to `packages/shared/dist`, a gitignored build output. With Vercel's root directory set to `apps/client`, the default build runs only `pnpm build` in the client, so `shared/dist` is never produced and the build fails on a clean clone. The live deployment probably relies on a build command configured in the Vercel dashboard, which is not in the repo.
**Expected:** The committed config reproduces the deployment, building shared first. **Actual:** The build order lives only in the Vercel dashboard (if at all).

| ID | Category | File(s) & Line(s) |
| :--- | :--- | :--- |
| **H-03** | UX / SSE contract | `apps/client/src/hooks/useSseStream.ts:167`, `apps/client/src/store/sessionSlice.ts:386-395`, `apps/client/src/components/interact/ChatTranscript.tsx:128` |

**Description:** `sendMessage` dispatches `startStreaming({ message })` to show the learner's in-flight bubble. When the server's `event: start` frame arrives, the hook dispatches `startStreaming({ turnId })` again. That reducer sets `activeTurnMessage = payload.message ?? null`, which **wipes the learner's message** and clears `streamBuffer`. The in-flight bubble (`chat-message-user-inflight`) disappears while the tutor streams and only reappears when `metadata` arrives. If the stream then fails, the error/retry state shows no record of what the learner sent. No test asserts the bubble survives the `start` frame.
**Expected:** The learner's message stays visible from send until it is persisted, including in the error/retry state. **Actual:** It vanishes as soon as the first SSE frame arrives.

| ID | Category | File(s) & Line(s) |
| :--- | :--- | :--- |
| **H-04** | Documentation / Guest Mode | `README.md:224`, `docs/architecture.md:252` vs `apps/client/src/services/apiClient.ts:67-71,156-199` |

**Description:** Both public docs say guest tokens live in **`sessionStorage`** and that "a guest session belongs to the tab that created it". The client actually uses **`localStorage`** (`mentora_guest_tokens`), and expired tokens are pruned on read, so a guest session is reachable from any tab of the same browser for up to 2 h. Security reviewers and recruiters reading the README will form a wrong mental model of guest isolation.
**Expected:** The docs describe `localStorage`, browser-scoped (not tab-scoped) access, and expiry pruning. **Actual:** They describe `sessionStorage`, tab-scoped.

### Medium

| ID | Category | File(s) & Line(s) | Description | Expected vs. Actual |
| :--- | :--- | :--- | :--- | :--- |
| **M-01** | Interact state machine | `apps/server/src/services/interact.service.ts:315-323` (preconditions), `:150,162,175,185` (transitions) | `validateTurnPreconditions` rejects only `NOT_STARTED`. A `COMPLETED` interact session still accepts `/interact/stream` turns, each **charged a quota unit**. Any non-`ADVANCE` outcome then returns `nextStatus: ACTIVE`, regressing a completed session to active. The client disables input on completion (`InteractStage.tsx:237`), so only direct API callers or a stale tab hit this. | **Expected:** 409/400 with no charge once completed, and the status never regresses. **Actual:** The turn is accepted and charged, and the status can flip `completed → active`. |
| **M-02** | Contract drift | `apps/server/src/middlewares/rateLimit.middleware.ts:21`; `packages/shared/src/enums/index.ts` (`ErrorCode`) | Rate-limit responses use `code: 'RATE_LIMIT_EXCEEDED'`, which is not in the shared `ErrorCode` enum / `ErrorCodeSchema`. The client casts it through (`apiClient.ts`, `rawCode as ClientApiErrorCode`). The envelope would fail `ApiErrorEnvelopeSchema.parse`. | **Expected:** Every error code is in `@mentora/shared`. **Actual:** An undeclared code is on the wire. |
| **M-03** | Deployment / Security config | `apps/client/vercel.json:16` | CSP `connect-src` hard-codes the author's backend `https://mentora-server-bxgm.onrender.com`. Anyone forking/deploying gets a client that cannot reach their own API, and changing `VITE_API_BASE_URL` alone silently breaks every request. Not documented in README. | **Expected:** The CSP is derived from config or documented as a required edit. **Actual:** It is hard-coded to one deployment. |
| **M-04** | Guest quota / proxy trust | `apps/server/src/app.ts:32`, `apps/server/src/middlewares/quota.middleware.ts:48` | Guest quota and both rate limiters key on `req.ip` with `trust proxy = 1`. If Render's edge adds more than one hop, `req.ip` becomes a proxy address. All guests would then share one 15/day bucket, and all users one 100/15 min API bucket. This is not verified against production. | **Expected:** The hop count is confirmed (e.g. log `req.ip` vs `X-Forwarded-For` on Render) and documented. **Actual:** It is assumed. |
| **M-05** | Content correctness | `apps/server/src/services/interact.service.ts:197-205` | `INTERNAL_TERMINOLOGY_PATTERN = /\b(circuit breakers?\|strikes?)\b/gi` rewrites **all** tutor output. Legitimate subject matter gets corrupted: "lightning strikes" → "lightning attempts", "labour strikes", "strike price", or an electrical-engineering lesson on circuit breakers → "direct explanation". | **Expected:** Scrub only jargon about the tutor's own state. **Actual:** Domain vocabulary is replaced in the streamed and persisted content. |
| **M-06** | Performance | `pnpm build` output; `apps/client/src/routes/AppRouter.tsx` | The entry chunk `index-*.js` is 487 kB (150 kB gzip) for the login/landing route, and Vite warns about >500 kB chunks. The workspace is lazy-loaded already, but the auth/onboarding pages are eagerly imported in `AppRouter.tsx`, and the entry has not been profiled (run a bundle visualizer to confirm what dominates it). On Render free-tier cold starts this compounds first-load time. | **Expected:** Entry < ~250 kB, or the warning addressed or consciously raised. **Actual:** 487 kB entry plus a build warning. |
| **M-07** | Test coverage | `apps/client/src/__tests__/InteractStage.test.tsx`, `InteractWorkflow.e2e.test.tsx`; `apps/server/src/__tests__/interact.*` | No test covers: (a) the in-flight user bubble after the `start` frame (H-03); (b) a stream turn against a `COMPLETED` session (M-01); (c) the rate-limit envelope shape (M-02); (d) concurrent Practice submits. | **Expected:** Regression tests for each core-flow edge. **Actual:** Gaps (the suite is otherwise strong at 423 tests). |
| **M-08** | Data integrity | `apps/server/src/services/practice.service.ts:185-296` | `submitBatch` is read-modify-`save()` with no status guard on the write. Two concurrent submits (double click, two tabs) both pass the `COMPLETED` check, and the last write wins, which can overwrite the first score. Generation uses `setIfMatches` (A-07), but submission does not. | **Expected:** A filtered update `{ 'batches.<tier>.status': 'in_progress' }` with 409 on loss. **Actual:** Last writer wins. |
| **M-09** | Documentation | `docs/architecture.md:282`, `:80`, `:451-461` | The architecture doc describes `PATCH /explain/progress` (actual: `/explain/step`) and the body `{ topic, initialMode }` (actual: `topicQuery`). The route table lists all session/mode routes as "JWT + Profile", while they are actually "JWT + Profile **or** Guest token", and `GET /sessions` is user-only. | **Expected:** The route table matches `session.routes.ts`. **Actual:** Three discrepancies in the public spec. |

### Low / Cleanup

| ID | Category | File(s) & Line(s) | Description | Expected vs. Actual |
| :--- | :--- | :--- | :--- | :--- |
| **L-01** | Dead code | `quota.middleware.ts:102` (`incrementGuestQuota`, test-only), `:319` (`incrementUserQuota`, unused); `auth.middleware.ts:126,156` (`authMiddleware`, `profileCompletedMiddleware` aliases, unused); `session.repository.ts:65` (`findGuestSessionById`, unused); `TopicSession.model.ts` (`TopicSessionModel` re-export, unused); `api-envelope.schema.ts` (`ApiSuccessEnvelopeSchema`, unused) | Leftovers from the pre-reservation quota model and earlier guards. | **Expected:** Removed. **Actual:** Exported but unused. |
| **L-02** | Dead code | `packages/shared/src/index.ts:1`, `apps/server/src/index.ts:58`, `apps/client/src/main.tsx:9` | Scaffolding sentinels (`MENTORA_WORKSPACE_READY`, `isServerWorkspaceReady`, `isClientWorkspaceReady`) are unused. | Remove. |
| **L-03** | Stale reference (Go Deeper) | `apps/client/src/index.css:39`; `docs/requirement.md:190` | A CSS comment references the deleted `DeepDiveSubCard`, and the requirement scope says "Explain cards and deep-dives generated". | No mention of the removed feature (beyond the explicit AC-EXP-03 retirement note). |
| **L-04** | Contract looseness | `packages/shared/src/schemas/explain.schema.ts:89-110`, `apps/server/src/controllers/explain.controller.ts:75-78` | `ExplainStepRequestSchema` accepts both `currentStepIndex` and `stepIndex`. The client only sends `stepIndex`. | Single field. |
| **L-05** | Explain semantics | `apps/server/src/services/explain.service.ts:127-157` | `advanceStep` accepts any index 0–3 even when `explainState.status === 'not_started'` (no cards). | 409/400 when not ready (optionally enforce `≤ current+1`). |
| **L-06** | Error code semantics | `apps/server/src/services/practice.service.ts:220-225` | "Batch already submitted" returns HTTP **409** with `VALIDATION_ERROR` (409 normally pairs with `CONFLICT`). | Use `ErrorCode.CONFLICT`. |
| **L-07** | AI output fabrication | `apps/server/src/ai/gemini.client.ts:177-188` | If the model omits card 4's check Q/A, the server invents a generic question and sets `checkAnswer` to the card's own `contentMarkdown`, so the "answer" reveal repeats the card body. | Prefer the retry path (already present) over fabricating, or use a clearly generic fallback. |
| **L-08** | Mermaid sanitizer false positives | `apps/server/src/utils/mermaid.sanitizer.ts:23-46` | Bracket balancing rejects valid syntax such as asymmetric nodes `A>label]` and any `]`/`)` inside unquoted edge labels, so valid diagrams are dropped. | Allow the known asymmetric shape, or rely on the client fallback for borderline cases. |
| **L-09** | Redundant DB work | `apps/server/src/controllers/interact.controller.ts:40` + `apps/server/src/services/interact.service.ts:454` | `validateTurnPreconditions` runs twice per turn (2 session reads, plus a user read for string refs). | Pass the validated session into `processTurnStream`. |
| **L-10** | Unbounded growth | `apps/server/src/models/TopicSession.model.ts:189` | `interactState.messages` is unbounded inside one document (16 MB BSON cap). Prompt history is bounded (A-11), but storage is not. | Cap or archive (very long-tail risk). |
| **L-11** | SSE error copy | `apps/client/src/hooks/useSseStream.ts:211-215` | A network drop mid-stream surfaces the raw `TypeError` text (e.g. "network error" / "Failed to fetch"). The friendly "Connection interrupted…" text is only used for non-`Error` throws. | Always show the friendly message for transport errors. |
| **L-12** | Client storage hygiene | `apps/client/src/hooks/useQuizDraftPersistence.ts`; `store/authSlice.ts:153` | Quiz drafts (`mentora_quiz_draft_*`) are never cleared on logout or session delete, so they accumulate and persist on shared devices. | Clear on logout/delete. |
| **L-13** | Repo hygiene | `.gitignore` | Missing common entries: `.claude/settings.local.json` (or `.claude/`), `*.tsbuildinfo`, `.vscode/`, `.idea/`. (`.env.*` variants are already covered.) | Add editor/agent-local ignores before public release. |
| **L-14** | Doc metadata drift | `docs/AGENTS.md:4`, `docs/implementation_plan.md:4,737`, `docs/AGENTS.md:14` | Both files claim "File Location: Repository Root", but they live in `docs/`. `implementation_plan.md` still lists `GEMINI_REASONING_MODEL=gemini-3.6-pro` (the code default is `gemini-3.5-flash-lite`; only the test-env default in `apps/server/src/config/env.ts:33` uses 3.6-pro). AGENTS.md references `product_requirement.md`, which does not exist. Also `zod` 4 deprecates `z.ZodIssueCode` (used throughout shared schemas). | Correct the paths and model names; consider `code: 'custom'`. |

### Areas reviewed with **no issues found**
- **Secrets:** No API keys, JWT secrets, Mongo credentials or personal emails in the tree or any of the 52 commits. Only `.env.example` files were ever committed, and history contains only dummy `user:pass` test URIs. `.env`, `dist/`, `node_modules/`, `coverage/`, `*.log` are ignored. `render.yaml` uses `sync: false` for all secrets.
- **Multi-tenancy:** Every user query filters on `{ _id, userId }`. `requireSessionAccess` restricts guests to the single `sid` in their token (404 for other IDs). Guest tokens (`typ: 'guest'`) and user tokens are mutually rejected. Guest-only repository paths require `isGuest: true`.
- **Practice masking:** `sanitizePracticeBatch` strips `correctOptionIndex` and `solutionExplanation` for every non-`completed` status, and the result is re-validated by the discriminated `PracticeBatchDTOSchema`. Applied on every session-returning endpoint.
- **Quota:** Atomic reserve, commit only on a winning write, release on idempotent paths, errors and client disconnect, with a `res.close` safety net. Explain step / mode switch / submit / delete are free.
- **SSE headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, `flushHeaders()`, and a 15 s heartbeat.
- **Env validation:** Zod-validated on both sides (server rejects `JWT_SECRET` < 32 chars; client requires a URL).
- **Health:** `/api/v1/health` returns 200 / 503 from `readyState` with no query; it matches `render.yaml` `healthCheckPath`.
- **Mermaid fallback:** `securityLevel: 'strict'`, `parse` before `render`, and a `mermaid-fallback` code block on error (tested).
- **Go Deeper removal:** Complete in code; only the stale comment/doc noted in L-03 remains.

---

## 4. Prioritized Remediation & Implementation Plan

Tasks are ordered by severity and dependency. Each one is independently verifiable. After every task, re-run the full gate:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

### FIX-001 — Make the Render build install devDependencies (H-01)
- **Target files:** `render.yaml`
- **Exact change:** Change `buildCommand` to
  `pnpm install --frozen-lockfile --prod=false && pnpm --filter @mentora/shared build && pnpm --filter @mentora/server build`.
  Leave `NODE_ENV=production` for runtime.
- **Verification:** `NODE_ENV=production pnpm install --frozen-lockfile --prod=false && pnpm --filter @mentora/shared build && pnpm --filter @mentora/server build` succeeds locally from a clean clone. Extend `deployment-artifacts.test.ts` to assert `--prod=false` is present. Confirm on a Render preview deploy.

### FIX-002 — Commit the Vercel build pipeline (H-02)
- **Target files:** `apps/client/vercel.json`, optionally `README.md` (new "Deployment" section)
- **Exact change:** Add
  `"installCommand": "cd ../.. && pnpm install --frozen-lockfile"` and
  `"buildCommand": "cd ../.. && pnpm --filter @mentora/shared build && pnpm --filter @mentora/client build"`, `"outputDirectory": "dist"`.
  Document that the Vercel root directory is `apps/client` and that `VITE_API_BASE_URL` must be set.
- **Verification:** On a fresh clone (`git clone … && cd mentora/apps/client`), run both commands and confirm `apps/client/dist/index.html` exists. Extend `deployment-artifacts.test.ts` to assert `buildCommand` builds `@mentora/shared` before the client. Confirm on a Vercel preview.

### FIX-003 — Keep the learner's in-flight message during streaming (H-03, M-07a)
- **Target files:** `apps/client/src/store/sessionSlice.ts`, `apps/client/src/hooks/useSseStream.ts`, `apps/client/src/__tests__/InteractStage.test.tsx`
- **Exact change:** Add a dedicated reducer `setActiveTurnId(turnId: string)` that sets only `streamingState.activeTurnId`, and dispatch it for the `start` frame instead of `startStreaming`. (Alternative: make `startStreaming` keep the existing `activeTurnMessage`/`streamBuffer` when `payload.message` is undefined.)
- **Verification:** New test: mock a stream that emits `start`, then pauses before `token`. Assert `getByTestId('chat-message-user-inflight')` contains the sent text after the `start` frame, and still does after an `error` frame. Then run `pnpm test`.

### FIX-004 — Correct Guest Mode storage docs (H-04)
- **Target files:** `README.md:224`, `docs/architecture.md:252`
- **Exact change:** Replace `sessionStorage` / "belongs to the tab that created it" with: "`localStorage` key `mentora_guest_tokens` (`sessionId → guestToken`); expired tokens are pruned on read; any tab in the same browser can reopen the session until the 2 h TTL; other browsers/devices are denied."
- **Verification:** `git grep -n sessionStorage -- README.md docs/` returns nothing. Review the docs manually.

### FIX-005 — Reject and don't charge Interact turns on completed sessions (M-01, M-07b)
- **Target files:** `apps/server/src/services/interact.service.ts`, `apps/server/src/__tests__/interact.state-machine.test.ts` (or `interact.e2e.test.ts`)
- **Exact change:** In `validateTurnPreconditions`, throw `new AppError(409, ErrorCode.CONFLICT, 'This Interact session is already complete.')` when `status === InteractStatus.COMPLETED`. This runs before SSE headers are sent, so the error middleware releases the reservation. Defensively, in `computeNextInteractState`, keep `COMPLETED` if the input was already completed.
- **Verification:** New e2e test: drive a session to `completed`, POST `/interact/stream`, and expect 409 JSON (not SSE). Assert `usageQuota.dailyCount` is unchanged and `interactState.status` is still `completed`. Then run `pnpm test`.

### FIX-006 — Declare `RATE_LIMIT_EXCEEDED` in the shared contract (M-02, M-07c)
- **Target files:** `packages/shared/src/enums/index.ts`, `apps/server/src/middlewares/rateLimit.middleware.ts`, `apps/client/src/services/apiClient.ts` (status-fallback map), `packages/shared/src/__tests__/modes.schema.test.ts`
- **Exact change:** Add `RATE_LIMIT_EXCEEDED` to `ErrorCode` and `ERROR_CODES`. Use `ErrorCode.RATE_LIMIT_EXCEEDED` in the limiter and type the handler response as `ApiErrorEnvelope`. Optionally show a dedicated client message.
- **Verification:** A test hits the auth limiter (`createApp(undefined, { authRateLimit: { limit: 1, windowMs: 60000 } })`) and asserts `ApiErrorEnvelopeSchema.parse(res.body)` succeeds. Then run `pnpm typecheck && pnpm test`.

### FIX-007 — Guard concurrent Practice submissions (M-08, M-07d)
- **Target files:** `apps/server/src/services/practice.service.ts`, `apps/server/src/__tests__/practice.service.test.ts`
- **Exact change:** Replace the final `save()` with `sessionRepo.setIfMatches(session._id, { [`practiceState.batches.${tier}.status`]: BatchStatus.IN_PROGRESS }, { …score, userAnswers, status, completedAt, activeTier, lastActiveMode, next-tier unlock… })`. On `null`, throw 409 `CONFLICT` ("already submitted"). This also fixes L-06.
- **Verification:** A test fires two `submitBatch` calls in parallel with different answers: exactly one resolves, the other rejects 409, and the persisted score matches the winner. Then run `pnpm test`.

### FIX-008 — Narrow the internal-terminology scrubber (M-05)
- **Target files:** `apps/server/src/services/interact.service.ts`, `apps/server/src/__tests__/interact.state-machine.test.ts`
- **Exact change:** Restrict the pattern to self-referential phrasing (e.g. `/\b(strike (one|two|three|1|2|3)|(first|second|third) strike|circuit[- ]breaker (triggered\|activated\|mode))\b/gi`). Alternatively drop the scrubber and rely on the prompt instruction, keeping a log-only detector.
- **Verification:** Unit tests: "Lightning strikes the tallest point" and "A circuit breaker trips on overcurrent" pass through unchanged, while "That's strike two" is still scrubbed. Then run `pnpm test`.

### FIX-009 — Make the CSP connect-src deploy-agnostic (M-03)
- **Target files:** `apps/client/vercel.json`, `README.md`
- **Exact change:** Either (a) document in README that `connect-src` must be edited to the deployer's API origin, or (b) move the CSP into a `<meta http-equiv>` injected at build time from `VITE_API_BASE_URL` via a small Vite `transformIndexHtml` plugin, leaving `frame-ancestors` in `vercel.json` (meta CSP cannot set it).
- **Verification:** `pnpm --filter @mentora/client build` with `VITE_API_BASE_URL=https://example.test/api/v1`, then check that `dist/index.html` contains `connect-src 'self' https://example.test`. Extend `deployment-artifacts.test.ts`.

### FIX-010 — Verify and document the proxy hop count (M-04)
- **Target files:** `apps/server/src/app.ts` (comment / optional `TRUST_PROXY` env), `apps/server/src/config/env.ts`, `README.md`
- **Exact change:** Temporarily log `{ ip: req.ip, xff: req.get('x-forwarded-for') }` on `/health` in a Render preview. Set `trust proxy` to the observed hop count, optionally via `TRUST_PROXY` (default 1) validated in `EnvSchema`. Document it next to Guest Mode.
- **Verification:** In production logs, `req.ip` equals the client's public IP for two different networks. Existing `guest-mode.routes.test.ts` stays green.

### FIX-011 — Fix public spec drift (M-09, L-03, L-14)
- **Target files:** `docs/architecture.md` (lines 80, 282, 451–461), `docs/requirement.md:190`, `docs/AGENTS.md:4,14`, `docs/implementation_plan.md:4,737`, `apps/client/src/index.css:39`
- **Exact change:** `/explain/progress` → `/explain/step`; `{ topic, …}` → `{ topicQuery, …}`; change the auth column to "JWT + Profile, or Guest token" (and "JWT only" for `GET /sessions`); drop "and deep-dives"; fix the "File Location" lines to `docs/`; remove the `product_requirement.md` alias; update the model name to `gemini-3.5-flash-lite`; delete `DeepDiveSubCard` from the CSS comment.
- **Verification:** `git grep -n -i "explain/progress\|deep-dive\|DeepDive\|product_requirement\|gemini-3.6-pro" -- docs README.md apps/client/src` returns only intentional hits (the test env default and the risk-table mention). Then run `pnpm test` (the deployment-artifacts test cross-checks README model values).

### FIX-012 — Remove dead exports and scaffolding sentinels (L-01, L-02)
- **Target files:** `apps/server/src/middlewares/quota.middleware.ts`, `apps/server/src/middlewares/auth.middleware.ts`, `apps/server/src/repositories/session.repository.ts`, `apps/server/src/models/TopicSession.model.ts`, `packages/shared/src/index.ts`, `packages/shared/src/schemas/api-envelope.schema.ts`, `apps/server/src/index.ts`, `apps/client/src/main.tsx`, plus any test that imports `incrementGuestQuota`/`clearGuestQuotaStore` (switch those to `GuestQuota.deleteMany` / `tryReserveGuestQuota`)
- **Exact change:** Delete the unused symbols listed in L-01/L-02.
- **Verification:** `pnpm typecheck && pnpm lint && pnpm test` pass, and `git grep -n -w "incrementUserQuota\|findGuestSessionById\|isServerWorkspaceReady\|MENTORA_WORKSPACE_READY"` is empty.

### FIX-013 — Explain and AI-output tightening (L-04, L-05, L-07, L-08)
- **Target files:** `packages/shared/src/schemas/explain.schema.ts`, `apps/server/src/controllers/explain.controller.ts`, `apps/server/src/services/explain.service.ts`, `apps/server/src/ai/gemini.client.ts`, `apps/server/src/utils/mermaid.sanitizer.ts`, related tests
- **Exact change:** Make `ExplainStepRequestSchema = z.object({ stepIndex })` only. In `advanceStep`, reject with 409 when `explainState.status !== 'ready'`. Remove the card-4 `checkAnswer = contentMarkdown` fabrication so missing Q/A falls into the existing retry. Teach the sanitizer the `>` asymmetric-node opener.
- **Verification:** Update and add unit tests in `explain.service.test.ts`, `ai.structured-runner.test.ts` and `mermaid.sanitizer.test.ts` (e.g. `graph TD\n A>flag] --> B` is kept). Then run `pnpm test`.

### FIX-014 — Small client hygiene (L-11, L-12)
- **Target files:** `apps/client/src/hooks/useSseStream.ts`, `apps/client/src/store/authSlice.ts` (or a logout listener), `apps/client/src/store/sessionSlice.ts` (delete thunk)
- **Exact change:** Always show "Connection interrupted. Your progress on this milestone was preserved." for `TypeError`/transport failures. Remove `mentora_quiz_draft_*` keys on logout and on session delete.
- **Verification:** Tests: a mocked `fetch` rejecting with `TypeError('Failed to fetch')` shows the friendly copy. After `logout`, `localStorage` has no `mentora_quiz_draft_` keys. Then run `pnpm test`.

### FIX-015 — Entry bundle and repo hygiene (M-06, L-09, L-10, L-13)
- **Target files:** `apps/client/vite.config.ts`, `apps/client/src/routes/AppRouter.tsx`, `.gitignore`, `apps/server/src/controllers/interact.controller.ts`
- **Exact change:** Lazy-load `LoginPage`/`RegisterPage`/`OnboardingPage`, and add `build.rolldownOptions.output.codeSplitting` groups (or raise `chunkSizeWarningLimit` deliberately for the lazy Mermaid `elk` chunk). Add `.claude/settings.local.json`, `*.tsbuildinfo`, `.vscode/`, `.idea/` to `.gitignore`. Pass the validated session from the controller into `processTurnStream`. Optionally cap stored Interact messages.
- **Verification:** `pnpm build` shows the entry `index-*.js` < 250 kB with no unacknowledged size warnings, and `pnpm test` passes.

---

*End of report.*
