# Mentora — Live Implementation Plan

Derived from `LIVE_TEST_REPORT.md` (2026-11-20). Nothing here has been implemented. Keep changes small; do not refactor working modes.

Many P0/P1 items are likely already fixed on branch `fix/phase1-guest-security` (guest tokens, longer AI timeouts, DB-aware health). Phase 1 therefore starts with **deploying and re-testing**, not new code.

---

## Phase 1 — Ship and verify existing fixes (P0/P1)

### L-04 / L-01 (P0) — Deploy current branch, verify guest isolation
- **Objective:** Live app enforces the guest token; live matches the repo.
- **Files/modules:** `apps/server/src/middlewares/auth.middleware.ts` (`requireSessionAccess`), `session.repository.ts`, `apps/client/src/services/apiClient.ts` (guest-token storage), `render.yaml`, Vercel project.
- **Approach:** Run `pnpm typecheck && pnpm test` on the branch, merge to `main`, let Vercel and Render redeploy. No new code unless re-testing fails.
- **Dependencies:** Green CI; correct `CLIENT_ORIGIN` and env secrets on Render.
- **Acceptance:** (a) `GET /sessions/{guestId}` with no `X-Guest-Token` → 401; with another session's token → 404. (b) `DELETE` and `practice/submit` behave the same. (c) Live `/health` returns `db: true`. (d) A guest can still open their own session after a page reload in the same tab.
- **Verification:** Repeat the live API probes from the report from the browser origin; create two guest sessions in two tabs and confirm neither can read the other.

### L-02 (P1) — Interact/Explain init timeouts
- **Objective:** No false "Request timed out" while the server is still generating.
- **Files:** `apps/client/src/config/timeouts.ts`, `store/sessionSlice.ts`, `components/interact/InteractStage.tsx`.
- **Approach:** Confirm the branch's 45 s fast / 90 s reasoning timeouts are live. If Interact init still exceeds 45 s in measurement, make the client poll `GET /sessions/:id` after a timeout (or return 202 and poll) so retry does not re-run and re-bill generation.
- **Dependencies:** L-04.
- **Acceptance:** Five consecutive Interact inits succeed without a client timeout; a forced timeout followed by Retry does not charge quota twice.
- **Verification:** Repeat the Interact tab flow with the network panel open; compare quota meta before/after.

### L-03 (P1) — Cold start and outage handling
- **Objective:** Users see a clear state instead of a long hang or CORS error.
- **Files:** `render.yaml` (plan), `apps/client/src/services/apiClient.ts`, `AuthPendingScreen.tsx`, `apps/server/src/app.ts` (CORS before all middleware).
- **Approach:** (1) Decide whether to move off the free plan or add an uptime ping to `/api/v1/health`. (2) In the client, show "Waking the server (up to ~30 s)…" when `/health` or the first request exceeds ~4 s, and map network/CORS-like failures to "Server unavailable — retry".
- **Dependencies:** Product decision on hosting cost.
- **Acceptance:** Cold-start first load shows the waking message and completes; a simulated 503 shows a retry message, not a raw failure.
- **Verification:** Stop the instance (or wait for idle spin-down) and load the app.

---

## Phase 2 — Backend correctness (P2)

### L-05 — Malformed JSON returns 500
- **Files:** `apps/server/src/middlewares/error.middleware.ts`.
- **Approach:** Map body-parser errors (`type === 'entity.parse.failed'`, `entity.too.large`) to 400/413 with the standard envelope.
- **Acceptance:** `POST /auth/login` with `{bad` → 400 `VALIDATION_ERROR`; body >100 kb → 413.
- **Verification:** Add supertest cases; re-run the live probe.

### L-06 — Off-topic input handling in Interact
- **Files:** `apps/server/src/services/interact.service.ts`, `ai/prompts/prompt.builder.ts`.
- **Approach:** When the model signals refusal/off-topic, do not increment strikes, do not trigger the breaker, and keep the milestone unchanged. Remove the words "strike" and "circuit breaker" from tutor-visible output (prompt instruction plus a strip/guard in the output parser).
- **Dependencies:** None.
- **Acceptance:** After an off-topic message, strike count and milestone are unchanged and no "Direct explanation…" badge appears; no reply contains "strike".
- **Verification:** Unit tests in `interact.state-machine.test.ts`; repeat the live scenario.

---

## Phase 3 — Frontend UX, accessibility and hardening (P2/P3)

| ID | Task | Files | Acceptance |
|---|---|---|---|
| L-07 / L-12 | Distinct "Session not found / not available" state for 401/404 on `/workspace/:id`; add a 404 route instead of silent redirect | `pages/WorkspacePage.tsx`, `routes/AppRouter.tsx` | Foreign/unknown ID shows a clear message and a "New topic" action; `/nope` shows 404 |
| L-10 | Friendly validation text; `aria-describedby` and `role="alert"` on field errors | `pages/LoginPage.tsx`, `RegisterPage.tsx`, shared Zod error messages | Messages read e.g. "Name must be at least 2 characters"; screen reader announces errors |
| L-09 | Add security headers | `apps/client/vercel.json` (`headers`) | Response has CSP (allow API origin, `unsafe-inline` styles only if required by Mermaid/KaTeX), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame-ancestors; app still renders diagrams and math (check console for CSP violations) |
| L-08 | Lazy-load Mermaid and heavy renderers; confirm manual chunks | `components/common/MermaidDiagram.tsx`, `vite.config.ts` | Main chunk < ~600 KB decoded; Explain page still renders diagrams |
| L-13 | Guest quota indicator and reset message | `components/layout/QuotaBadge.tsx`, `hooks/useQuotaStatus.ts` | Guest sees remaining actions; at 0 sees "resets in …" while still able to browse |
| L-11 | ≥44 px mobile touch targets; move focus into drawer and restore on close; Esc closes | `SidebarToggleButton.tsx`, `LeftHistorySidebar.tsx`, `McqQuestionCard.tsx`, `ModeSwitcherTabs.tsx` | Keyboard-only walkthrough passes; targets measured ≥44 px at 375 px |
| L-14 | Optional prompt tweak against misspelled domain terms (low value) | `prompt.builder.ts` | Not required for release |

---

## Phase 4 — Close the test gaps (no code; required before sign-off)

Run on a **staging** environment with a disposable account:
1. Register → onboarding (both steps) → workspace; wrong-password and duplicate-email cases.
2. Profile edit changes tone of the next Explain card (FR-003).
3. History sidebar order, reopen restores all three modes, delete session (FR-006).
4. Quota exhaustion for a user and a guest: refusal message, reset time, saved sessions still readable (BR-04).
5. Interact network drop mid-stream shows "Connection interrupted — Retry" without adding a strike (Edge 4).
6. Hard tier and 30-question summary (FR-014, AC-PRC-03).
7. Mermaid syntax failure fallback and code-block rendering (FR-009, Edge 3).
8. Firefox, Safari, and a real mobile device; Lighthouse and an axe/contrast pass.
9. Token expiry behaviour on guest and user routes.

**Exit criterion:** all FR rows PASS or documented as accepted limitations; no open P0/P1.

---

## Suggested order
Phase 1 (deploy + re-test) → Phase 2 → Phase 3 (L-07, L-10, L-09 first) → Phase 4 → re-issue `LIVE_TEST_REPORT.md`.
