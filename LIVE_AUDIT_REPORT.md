# Mentora — Live Browser Audit Report

**Date:** 2026-11-22 (≈10:35–11:05 UTC)
**Live URL tested:** https://mentoraclient.vercel.app/workspace (API: https://mentora-server-bxgm.onrender.com/api/v1)
**Build under test:** whatever Vercel/Render were serving at the time; local repo at `fix/phase2-backend-correctness` @ `340a1d7` was used only to trace root causes.
**Method:** Real Chromium browser pane, clean profile (empty `localStorage`/`sessionStorage`/cookies at start). Console and network were monitored throughout. The pane's network panel does not list cross-origin XHR, so API traffic was captured with an in-page `XMLHttpRequest`/`fetch` recorder (headers, bodies, status, timing, raw SSE frames).
**Viewports:** Desktop 1440×900 and Mobile 390×844 (emulated). Some steps ran at the pane's native ~910px width.
**Test data created:** guest session `6b02c5d961c7468ff04d15e1` ("Dijkstra's Algorithm") and test account `audit_test_1795344556883@example.com` (onboarded, with one remaining session, "Deadlocks in Operating Systems"). A second session, "Binary Search Trees", was created and then deleted as part of the test. The user typed the account password; it was not entered by the auditor. No source code was modified.

---

## 1. Executive Summary & Live Readiness Verdict

### Verdict: **Fixes Required**

Mentora's core learning loop works well in production. Explain cards render tables, KaTeX, syntax-highlighted code and Mermaid. Interact streams progressively and never leaked `<<MENTORA_STATE>>`. Practice masks answers while a batch is in progress, restores drafts after a reload, and scores and unlocks tiers correctly. Auth, onboarding guards (client and server), profile persistence, history, delete and logout/login all behave. The guardrail refusal is clean.

Four problems should be fixed before sharing the link publicly:

1. **The Render backend went down twice in about 15 minutes.** Both times it returned `503 x-render-routing: hibernate-wake-error` for 45–90 s. The browser reports these as CORS errors, and the UI tells the user to "check your internet connection".
2. **Guest quota is not tied to the guest.** Successive requests from one browser were counted in three different server-side quota windows, so the 15/day guest limit is neither enforced per person nor shown accurately.
3. **The "New Topic" button doesn't work on the first click** from inside a session. The URL changes to `/workspace`, but the old session is re-fetched and shown again. This reproduced in both guest and authenticated mode.
4. **The mobile (390px) session header is broken for guests.** The mode tabs cover the hamburger, so the history drawer can't be opened. "Get Started" is cut off, and the topic title collapses to 0px for every user.

### Totals (feature-matrix cells, Guest + Auth columns combined)

| Result | Count |
|---|---|
| Pass | 49 |
| Partial | 11 |
| Fail | 9 |
| Not tested / N/A | 19 |

**Bugs logged:** 0 Critical · 4 High · 4 Medium · 8 Low.

---

## 2. Feature-by-Feature Test Matrix

Legend: **Pass** / **Partial** / **Fail** / N/T = not tested in that mode / N/A = not applicable.

### Track 1 & 2 — Access, Auth, Persistence

| # | Feature | Guest | Auth | Notes |
|---|---|---|---|---|
| 1 | Landing/workspace render, Get Started CTA | Pass | Pass | No console errors on load; guest sees header + sidebar CTA. |
| 2 | Sidebar state for guests (no history call / error toast) | Pass | N/A | No `GET /sessions` for guests; "Personalized Learning" CTA shown. |
| 3 | `/api/v1/health` wake-up call on app load | Pass | Pass | Fires on every page load (330–544 ms while warm). |
| 4 | Create topic session (Enter-to-submit) | Pass | Pass | 6.5 s guest (Explain); 12.2 s (Explain) / 7.6 s (Interact) authed. |
| 5 | Guest token storage + `X-Guest-Token` header | Partial | N/A | Header attached on every session call, and missing or tampered token → 401. The token is stored in **`localStorage`** (`mentora_guest_tokens`), not `sessionStorage` as the checklist expects. This is intentional per `apiClient.ts:67-71` (reopen in a new tab); JWT `exp` = 2 h. |
| 6 | Daily quota indicator (15 guest / 50 user) | **Fail** | Pass | Guest: the counter stalls and jumps between server buckets (BUG-H2), and disappears after a reload (BUG-L4). Auth: 50→49→48→…→45, one consistent `resetAt`. |
| 7 | Reload keeps session/mode within tab | Pass | Pass | Practice mode + Easy tier restored after reload. |
| 8 | Registration | N/A | Pass | Lands on `/onboarding`. |
| 9 | `/workspace` & `/workspace/:id` blocked before onboarding | N/A | Pass | Both redirect to `/onboarding`; API `GET /sessions` → `403 PROFILE_INCOMPLETE`. |
| 10 | 2-step onboarding → `/workspace` | N/A | Partial | First save failed during a backend outage (BUG-H4); the retry succeeded and redirected correctly. |
| 11 | Profile Settings update persists after reload | N/A | Pass | Style changed Visual → Analogy-Heavy; persisted. Escape closes the modal. |
| 12 | ≥2 sessions in sidebar, reverse-chronological | N/A | Pass | "Binary Search Trees" above "Deadlocks…". |
| 13 | Reopen earlier session, states intact | Pass | Pass | Explain progress (card 2) and the 4-message Interact transcript restored. |
| 14 | Delete session (inline Yes/No) persists after reload | N/A | Pass | Removed from sidebar; `GET` → 404 after reload. |
| 15 | Logout clears tokens & workspace state | N/A | Partial | Token and history cleared, but the user stays on `/workspace/:id`, which now reads "Session not found" (BUG-L6). |
| 16 | Re-login restores history & quota | N/A | Pass | 1 session, 45/50 left. |
| 17 | "New Topic" button from inside a session | **Fail** | **Fail** | The first click re-fetches and re-shows the old session at `/workspace` (BUG-H3). Reproduced 2/2. |

### Track 3 — Learning Modes

| # | Feature | Guest | Auth | Notes |
|---|---|---|---|---|
| 18 | Explain: only Card 1 initially; sticky 4-step bar | Pass | Pass | Bar stays pinned under the header while scrolling. |
| 19 | Explain: Next → Cards 2, 3, 4; Card 4 reveal | Pass | Partial | Guest: all 4 cards and Reveal/Hide work, and Enter on a focused Next works. Auth: only cards 1–2 exercised. Next doesn't scroll to the new card (BUG-L8). |
| 20 | GFM tables | Pass | Pass | |
| 21 | KaTeX inline `$…$` | Pass | Pass | 20 expressions, 0 `.katex-error`. |
| 22 | KaTeX display `$$…$$` | Partial | Partial | A single-line `$$…$$` renders inline, not centred (BUG-L1). |
| 23 | Syntax highlighting + Copy button | Partial | N/T | Prism highlighting works (157 tokens). Copy gives no feedback when the clipboard write fails (BUG-L2). |
| 24 | Mermaid diagrams | Pass | Pass | Rendered in an Interact reply (guest) and Explain Card 1 (auth); no raw syntax and no crash. Edges are low-contrast (BUG-L7). |
| 25 | Interact: 3–5 milestones, M1 active, opening question | Pass | Pass | 4 milestones both times. |
| 26 | Interact: progressive SSE streaming | Pass | Pass | TTFB 1.7 s; text grew in about 10 increments over ~3.4 s; Send is disabled with "Mentora is streaming…". |
| 27 | No `<<MENTORA_STATE…>>` leak (DOM + raw SSE) | Pass | Pass | The header is stripped server-side; none of the raw `token` frames contained it. |
| 28 | 3-Strike circuit breaker | **Fail** | Pass | Guest: the direct explanation fired on **strike 2** (BUG-M1). Auth: Strike 1 nudge → Strike 2 two-choice hint → Strike 3 direct explanation + `strikeCount` reset to 0. |
| 29 | Manual "Explain this milestone directly" | Pass | N/T | `forceDirectExplanation:true`; direct answer; no loop; milestone not auto-advanced. |
| 30 | Milestone tracker text | **Fail** | **Fail** | Raw LaTeX visible (`$V$`, `$E$`, `\mathbb{R}_{0}^{+}`, `$\mathcal{O}(h)$`) (BUG-M2). |
| 31 | Practice: Easy active, Medium/Hard locked | Pass | N/T | |
| 32 | Practice masking (`/practice/generate`, `GET /sessions/:id` in progress) | Pass | N/T | Neither `correctOptionIndex` nor `solutionExplanation` appears anywhere in either raw JSON body. Question keys: `questionNumber, questionText, options, hint`. |
| 33 | Practice hint toggle | Pass | N/T | Has `aria-expanded`. |
| 34 | Draft answers restored after reload | Pass | N/T | `mentora_quiz_draft_<id>_easy` restored [1,1,2,…]; cleared after submit. |
| 35 | Submit disabled until 10/10 | Pass | N/T | Disabled at 3/10 and at 9/10; enabled at 10/10. |
| 36 | Score X/10, review (choice vs correct + explanation), Medium unlock | Pass | N/T | Deliberately wrong Q4 → 9/10 (90%). Review shows "✗ Your Choice / ✓ Correct Option" plus the explanation; Medium → `not_started`. |
| 37 | Cross-mode switching, zero data loss | Pass | Pass | |
| 38 | Off-topic guardrail ("spam email to sell watches") | Pass | N/T | `422 EDUCATIONAL_GUARDRAIL_REFUSAL`; polite amber banner; no crash; no orphan session. |

### Track 4 — UI/UX, Responsiveness, Accessibility

| # | Feature | Guest | Auth | Notes |
|---|---|---|---|---|
| 39 | Desktop 1440×900 layout | Pass | Pass | No overflow; sticky header and progress bar don't overlap content. |
| 40 | Mobile 390×844 layout | **Fail** | Partial | Guest header overflows by 60px and the tabs cover the hamburger (BUG-H1); the title is 0px wide for everyone. A chat bubble containing a table overflows (BUG-M3). |
| 41 | Mobile drawer | Partial | Pass | Works from the landing page (Escape closes it and focus returns). It can't be opened inside a guest session (BUG-H1). |
| 42 | Loading skeletons | Pass | Pass | Interact "Decomposing topic…", Practice "Generating 10 Verified EASY Questions…". |
| 43 | Keyboard: Tab/Enter on forms, Explain Next, MCQ options | Partial | Partial | Enter submits the topic, Enter on Next works, Space/Enter selects an MCQ option. Arrow keys don't move within a question, and all 40 options are separate Tab stops (BUG-L5). The Profile modal doesn't move focus into the dialog (BUG-L5). |
| 44 | Backend availability during test | **Fail** | **Fail** | Two outages (BUG-H4). |

---

## 3. Console, Network, & Performance Observations

### Console
- **Expected or audit-caused errors only:** 401 (tampered and missing guest-token probes; a deep link after logout), 403 (onboarding-guard probe), 404 (deleted-session probe), 422 (guardrail test).
- **Errors caused by the outages:** `Access to XMLHttpRequest … blocked by CORS policy: No 'Access-Control-Allow-Origin' header` on `PATCH /mode`, `POST /practice/generate`, `GET /health` and `PUT /profile`. These aren't CORS misconfigurations. Render's 503 error page simply doesn't carry CORS headers, so the browser reports a CORS failure.
- **No** React warnings, uncaught exceptions or Mermaid/KaTeX errors in the production console.

### Network & latency (warm instance)

| Call | Latency |
|---|---|
| `GET /health` (on load) | 330–544 ms |
| `POST /sessions` (Explain init) | 6.5 s · 12.2 s |
| `POST /sessions` (Interact init) | 7.6 s |
| `POST /interact/init` | 4.2 s |
| `POST /interact/stream` | TTFB 1.7 s; first visible text ~7 s after send; ~3.4 s streaming |
| `POST /practice/generate` | 12.6 s |
| `POST /practice/submit` | 1.7 s |
| `GET /sessions/:id` | 1.5 s |
| `PUT /profile` | 2.1 s |

- **Cold start:** the instance was warm when testing began, so the 15-minute spin-down cold start wasn't measured.
- **Outages:**

  | Window (UTC) | Duration | Response |
  |---|---|---|
  | ~10:42:30 → 10:43:36 | ~1 min | `503`, `x-render-routing: hibernate-wake-error`, `Content-Length: 0` |
  | ~10:50:20 → 10:52:12 | ~1.5–2 min | same |

  The first outage began right after an Interact escape-hatch stream; the second right after account registration. No requests were in flight when either outage started.

### SSE streaming
- Response headers: `content-type: text/event-stream`, `cache-control: no-cache, no-transform`. Events seen: `start`, `token` (×n), `metadata`, `done`.
- `metadata` carries `strikeCount`, `activeMilestoneIndex`, milestones, the persisted user and assistant messages, and `quota`.
- Streaming is smooth and the UI never froze. Tokens arrive in chunks of tens of characters rather than per token, which is fine.

### Practice payload masking — **PASS**
The raw response text of both `POST /practice/generate` and `GET /sessions/:id` (batch `in_progress`) contained neither `correctOptionIndex` nor `solutionExplanation`. Both fields appear only in the `/practice/submit` response, after completion.

### Storage
| Key | Store | Notes |
|---|---|---|
| `mentora_guest_tokens` | localStorage | Map of sessionId → guest JWT (2 h). Not removed after register, login or logout. |
| `mentora_auth_token` | localStorage | User JWT. Removed on logout. |
| `mentora_quiz_draft_<sessionId>_<tier>` | localStorage | Removed after submit. |
| sessionStorage | — | Never used. |

### Guest quota evidence (BUG-H2)
`quota.resetAt` returned by consecutive guest actions from the same browser, about 60 s apart:

| Action | `resetAt` | `used` |
|---|---|---|
| interact/init | 2026-11-23T10:18:35.441Z | 2 |
| stream (strike 1) | 2026-11-23T10:18:06.372Z | 3 |
| stream (strike 2) | 2026-11-23T10:17:47.219Z | 3 |
| stream (escape hatch) | 2026-11-23T10:18:06.372Z | 4 |
| practice/generate | 2026-11-23T10:18:35.441Z | 3 |

Three different `GuestQuota` documents were in use, and all of them pre-date this audit's first request (10:37). Compare the authenticated user: one `resetAt`, and `used` went 3 → 4 → 5.

---

## 4. Bugs & Defects Log

### Critical
None.

### High

#### BUG-H1 — Mobile session header overflows: hamburger unreachable, CTA clipped, title hidden
- **Severity:** High · **Area:** Layout / Mobile (Guest; title issue affects all users)
- **Steps:**
  1. At 390×844 as a guest, open any session (`/workspace/:id`).
  2. Tap the ☰ icon.
- **Expected:** The history drawer opens; the topic title and "Get Started" are visible.
- **Actual:**
  - The header's right group is 422px wide inside a 358px content box, so it overflows to x=450px.
  - `document.elementFromPoint` at the hamburger's centre returns the **"Explain Mode"** tab, so tapping ☰ switches mode instead of opening the drawer.
  - "Get Started" is cut off at the viewport edge.
  - The `<h1>` title is 0px wide.
  - Authenticated users keep a reachable hamburger, but their title is still 0px.
- **Root cause:** `apps/client/src/components/layout/StickyTopicHeader.tsx:35-82`
  - The header is a single non-wrapping `flex … justify-between` row.
  - The right group (`ModeSwitcherTabs` + guest CTA) is `flex-shrink-0` (line 70).
  - The left group is `min-w-0` (line 36), so it collapses to 0 and the right group paints over it.

#### BUG-H2 — Guest quota is keyed on an unstable proxy IP, not the guest
- **Severity:** High (abuse/cost control and user-facing accuracy) · **Area:** Server / Quota (Guest)
- **Steps:**
  1. As a guest, perform several AI actions about a minute apart.
  2. Inspect `meta.quota` / SSE `metadata.quota` for each.
- **Expected:** One quota window per guest; `used` increments by 1 per action up to 15.
- **Actual:** Three different windows were used (table in §3). Counts barely move and the badge jumps. The buckets pre-dated this audit, so they are probably **shared with other visitors**. That means unrelated guests can exhaust each other's quota, while a single guest effectively gets more than 15 actions per day.
- **Root cause:** `getGuestIdentifier` keys guest quota on `req.ip` (`apps/server/src/middlewares/quota.middleware.ts:48-50`), and `req.ip` comes from `app.set('trust proxy', env.TRUST_PROXY)` (`apps/server/src/app.ts:33`) with `TRUST_PROXY` defaulting to `1` (`apps/server/src/config/env.ts:21`). Render's responses show Cloudflare in front (`Server: cloudflare`, `CF-RAY`) and then Render's router. With one trusted hop, `req.ip` most likely resolves to a rotating edge or proxy address rather than the client. The IP-keyed rate limiter in `app.ts` (~line 47) is likely affected the same way.

#### BUG-H3 — "New Topic" first click bounces back to the current session
- **Severity:** High (core navigation) · **Area:** Client / Routing (Guest + Auth)
- **Steps:**
  1. Open any session at `/workspace/:id`.
  2. Click "+ New Topic" in the sidebar.
- **Expected:** An empty "What topic would you like to master?" form.
- **Actual:**
  - The URL becomes `/workspace`.
  - A new `GET /sessions/<old id>` fires immediately.
  - The old session is rendered again under the bare `/workspace` URL.
  - A second click works. Reproduced 2/2 (guest and authenticated).
- **Root cause:**
  - `LeftHistorySidebar.tsx:75-80` calls `navigate('/workspace')` and then synchronously `dispatch(clearActiveSession())`.
  - React Router v7 (`react-router-dom ^7.18.4`, `BrowserRouter`) applies navigation state inside `React.startTransition`. The urgent Redux update therefore re-renders `WorkspacePage` while `useParams()` still returns the old `sessionId`.
  - The deep-link hydration effect (`apps/client/src/pages/WorkspacePage.tsx:70-77`) then sees `sessionId && !activeSession` and refetches.
  - The code comment on line 76 assumes `navigate` runs first, which no longer holds under transitions.

#### BUG-H4 — Backend outages (503 `hibernate-wake-error`) surfaced as "check your internet connection"
- **Severity:** High · **Area:** Infra / Server + Client error handling
- **Steps:** Use the app for about 10 minutes. Twice, all API calls failed for 1–2 minutes. A direct `curl` returned `HTTP 503`, `x-render-routing: hibernate-wake-error`, with an empty body.
- **Expected:** The service stays up while in use. When it is unavailable, the UI says the server is waking up or unavailable and retries automatically.
- **Actual:**
  - The browser shows CORS errors (Render's 503 has no ACAO header).
  - The UI says "Network error. Please check your internet connection." (Practice tab and onboarding save).
  - Switching to Practice auto-fired `/practice/generate`, which failed.
  - "Retry Generation" retried only the generate call, not the failed `PATCH /mode`.
- **Suspected root cause:**
  - **Infra:** the free Render instance restarting or hibernating under load (`render.yaml:5` `plan: free`, 512 MB). The process is started through the `pnpm --filter … start` wrapper (`render.yaml:9`), which adds memory overhead.
  - **Server:** there are no `unhandledRejection`/`uncaughtException` handlers (`apps/server/src/index.ts:50-62`), so any stray rejection kills the process with no log context. Render's service logs for 10:42 and 10:50 UTC are needed to confirm the cause.
  - **Client:** every status-0 failure is mapped to the generic connectivity message (`apps/client/src/services/apiClient.ts:233-236`), with no health-probe-driven retry.

### Medium

#### BUG-M1 — Circuit breaker fires on Strike 2 when the model emits `CIRCUIT_BREAKER_ACK` early
- **Severity:** Medium · **Area:** Interact / Server state machine
- **Steps:**
  1. In guest session "Dijkstra's Algorithm", Milestone 2: send "I don't know" → `strikeCount` 1 (correct).
  2. Send "No idea, sorry".
- **Expected:** Strike 2 = a concrete hint or analogy; `strikeCount` 2.
- **Actual:** `metadata.strikeCount: 0` and `assistantMessage.isCircuitBreakerExplanation: true`. A full direct explanation was given after only 2 strikes. In a second session (authenticated, "Binary Search Trees") the same steps behaved correctly, so the bug is non-deterministic and depends on the model.
- **Root cause:** `computeNextInteractState` trusts the model's outcome regardless of strike count: `if (outcome === SocraticOutcome.CIRCUIT_BREAKER_ACK || strikeCount >= 2)` (`apps/server/src/services/interact.service.ts:157`). The prompt (`apps/server/src/ai/prompts/prompt.builder.ts:313-337`) asks for this only at strike 2, but the server never enforces it.

#### BUG-M2 — Milestone tracker shows raw LaTeX
- **Severity:** Medium · **Area:** Interact UI (all users)
- **Steps:** Start Interact on a math-heavy topic (e.g. Dijkstra, BST).
- **Expected:** Rendered math, or plain-text descriptions.
- **Actual:** "…using vertices $V$ and edges $E$, with strict non-negative edge weight functions $w: E \to \mathbb{R}_{0}^{+}$" and "…bounds operational complexity to $\mathcal{O}(h)$".
- **Root cause:** `apps/client/src/components/interact/MilestoneTrackerBar.tsx:155-170` renders `milestone.title` and `milestone.description` as plain text. The init prompt doesn't forbid LaTeX in milestone fields.

#### BUG-M3 — Interact message bubble with a table overflows on mobile
- **Severity:** Medium · **Area:** Interact UI / Mobile
- **Steps:**
  1. At 390px, open a session whose transcript includes a tutor message with a Markdown table (the strike-2 direct explanation in the guest Dijkstra session).
- **Expected:** The table scrolls horizontally inside the bubble.
- **Actual:** The bubble grows to 505px and its right side is clipped by the page's `overflow-hidden` (r = 582px).
- **Root cause:** The bubble is a flex child `flex-1` without `min-w-0` (`apps/client/src/components/interact/ChatTranscript.tsx:97`; same in `StreamingBubble.tsx:31`). Its min-content width becomes the table's width, defeating the table wrapper's `overflow-x-auto` (`RichMarkdownRenderer.tsx:51`).

#### BUG-M4 — Practice tab auto-generation fails silently into an error state while the server is unavailable
- **Severity:** Medium (amplifies BUG-H4) · **Area:** Practice / Client
- **Steps:** Switch to Practice while the API returns 503.
- **Expected:** "Server is waking up…" with automatic retry.
- **Actual:** "Practice Request Failed — Network error. Please check your internet connection." The user has to press Retry, and the mode switch (`PATCH /mode`) is never retried. On the next reload the server still reported the old mode until generate succeeded.
- **Root cause:** `apps/client/src/components/practice/PracticeStage.tsx` (error branch ~line 200) plus `apiClient.ts:233-236`; the auto-generate effect has no back-off or health check.

### Low

| ID | Area | Steps → Actual | Expected | Root cause |
|---|---|---|---|---|
| **BUG-L1** | Explain / Interact rendering | `$$d[v] = d[u] + w(u, v)$$` on its own line renders as **inline** math (left-aligned, small). Same for `$$\text{Total Time} = …$$` in Interact. | Centred display math. | `remark-math@6` treats single-line `$$…$$` as inline (text) math; display math needs `$$` on separate lines. `RichMarkdownRenderer.tsx:2-6` does no normalisation. |
| **BUG-L2** | Code block Copy | Clicking Copy when `navigator.clipboard.writeText` rejects (as in the test browser: `NotAllowedError`) changes nothing: no "Copied!", no error. | Fallback copy, or a "Copy failed" message. | `CodeBlock.tsx:25-35` swallows the error and has no `execCommand('copy')` fallback. |
| **BUG-L3** | Explain UX | Clicking **Next** reveals the next card below the fold without scrolling to it. | Smooth-scroll to the new card. | `ExplainStage.tsx:43-57`: `handleNext` dispatches only; scrolling exists only in `handleSelectStep` (line 66-71). |
| **BUG-L4** | Guest quota badge | After any reload, the guest "Daily AI Quota" badge disappears until the next AI action. | Badge always visible (e.g. "15/15" or the server value). | `QuotaBadge.tsx:12-13` hides it for guests when `state.auth.quota === null`; nothing hydrates guest quota on load. |
| **BUG-L5** | Accessibility | (a) MCQ options: arrow keys do nothing, and all 40 options are separate Tab stops. (b) Opening Profile Settings leaves focus on the trigger, with no focus trap. | (a) WAI-ARIA radiogroup pattern (roving `tabIndex`, ↑/↓). (b) Focus moves into the dialog and is trapped, then restored on close. | (a) `McqQuestionCard.tsx:86-110` (`tabIndex={0}` on every option; only Space/Enter handled). (b) `ProfileSettingsModal.tsx:62-82` has an Escape handler but no initial focus or trap. |
| **BUG-L6** | Logout | Sign out while on `/workspace/:id` → the page re-fetches without auth and shows "Session not found. This session doesn't exist or isn't available to you." | Redirect to `/workspace` (or `/login`) with the workspace cleared. | `LeftHistorySidebar.tsx:334`: `onClick={() => dispatch(logout())}` doesn't navigate or clear the active session. |
| **BUG-L7** | Mermaid styling | Diagrams inside the dark (`bg-slate-900`) Explain card use the light theme: dark edges and arrows are barely visible, and edge labels sit on grey boxes. | A theme that matches the container. | `MermaidDiagram.tsx:14-17`: `theme: 'default'`. |
| **BUG-L8** | Onboarding copy | Step 2 shows "STEP 2 OF 2 · 100% COMPLETED" before the user has chosen a style or submitted. | "50%" → "100%" only on completion (or "Step 2 of 2" without a percentage). | `apps/client/src/pages/OnboardingPage.tsx` progress label. |

**Observations (not logged as bugs):**
- **Guest token store:** guest tokens live in `localStorage` rather than `sessionStorage`. This is documented as intentional, but it differs from the checklist.
- **Guest work isn't migrated:** `mentora_guest_tokens` is never cleared and guest sessions aren't migrated on register or login, so guest work is silently lost from view after sign-up.
- **Auth token storage:** the user JWT is in `localStorage`; the strict CSP (`script-src 'self'`) mitigates XSS exposure.
- **Strike 1 content:** the Strike 1 reply in the guest session was already fairly instructional (it explained both heap complexities before re-asking). That is acceptable but close to a hint.

---

## 5. Prioritized Bug-Fix Implementation Plan

Each task can be done and verified independently. Order = user impact × likelihood.

### LIVE-FIX-001 — Fix "New Topic" bounce-back (BUG-H3) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/client/src/pages/WorkspacePage.tsx` (deep-link hydration effect)
  - `apps/client/src/components/layout/LeftHistorySidebar.tsx` (comment only)
  - `apps/client/src/__tests__/WorkspaceShell.test.tsx` (2 regression tests)
- **Fix as implemented:**
  - The deep-link effect now remembers, in a `useRef`, the routed `sessionId` it has already loaded or fetched. It fetches each id at most once per visit; the ref resets when the route has no `:sessionId`.
  - Clearing the active session while the URL still holds the old id therefore no longer triggers a refetch. That happens on the first render of New Topic (React Router v7 applies `navigate` in a transition) and when deleting the open session (`deleteSessionThunk.fulfilled` clears it before the sidebar navigates).
  - Fixing it here, rather than at each call site, also covers that delete case: deleting the open session used to fire a stray `GET /sessions/:id` → 404.
- **Verification:**
  - New RTL tests "does not re-fetch the open session when New Topic is clicked" and "… after deleting it" failed on the old code (1 stray GET each) and pass now.
  - Full client suite: 150/150 pass; `tsc --noEmit` and `eslint src` are clean.
  - Live check after deploy: one click from any session shows the empty form, and no `GET /sessions/:id` appears in the network log.

### LIVE-FIX-002 — Responsive session header (BUG-H1) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/client/src/components/layout/StickyTopicHeader.tsx`
  - `apps/client/src/components/layout/ModeSwitcherTabs.tsx`
  - `apps/client/src/__tests__/guest-mode.ui.test.tsx` (structural regression assertions)
- **Fix as implemented:**
  - The header is `flex-wrap` below `md` (768px). Row 1 holds the menu button, the title (`flex-1 min-w-0 truncate`) and, for guests, "Get Started". Row 2 holds the mode tabs (`order-last w-full`), stretched to full width with equal-width buttons.
  - From `md` up it is one row again (`md:flex-nowrap`, tabs `md:order-none md:w-auto`, CTA `md:order-last`), so the order stays title → tabs → Get Started.
  - Below `sm`, the tabs show short labels ("Explain / Interact / Practice"). The full names stay the accessible names via `aria-label`, so screen readers and existing tests are unaffected.
  - The guest CTA keeps its text and gets a 44px touch target on mobile.
- **Verification (local Vite dev server, temporary harness rendering the guest and signed-in variants):**

  | Width | Horizontal overflow | Menu button reachable | Title width (guest / auth) | Header height |
  |---|---|---|---|---|
  | 320px | none | yes | 130 / 232px | 126px (2 rows) |
  | 390px | none | yes | 201 / 302px | 126px (2 rows) |
  | 640px | none | yes | 434 / 536px | 124px (2 rows) |
  | 768px | none | yes | 156 / 257px | 72px (1 row) |
  | 1440px | none | hidden (desktop sidebar) | 884 / 985px | 72px (1 row) |

  - "Menu button reachable" means `elementFromPoint` at the button's centre returns the button itself.
  - Full client suite 150/150 passes; `tsc --noEmit` and `eslint src` are clean.
  - Still to do after deploy: re-run the 390×844 check on the live site inside a guest session.

### LIVE-FIX-003 — Correct guest identity for quota & rate limiting (BUG-H2) — ✅ fixed and verified live (2026-11-22 11:38 UTC)
- **Extra live evidence (pre-fix):**
  - Twelve back-to-back `GET /api/v1/health` calls from one machine returned `RateLimit: … r=99, 99, 98, 98, 97, 97, 96, 96, 95, 94, 93` (one response wasn't captured).
  - The API rate limiter uses the same `req.ip` key, so one client was alternating between at least two rate-limit keys.
  - Render's proxy hop count is undocumented, so no `TRUST_PROXY` value can be shown to be correct.
- **Target files:**
  - `apps/server/src/utils/clientIp.ts` (new)
  - `apps/server/src/middlewares/quota.middleware.ts`
  - `apps/server/src/middlewares/rateLimit.middleware.ts`
  - `apps/server/src/app.ts`
  - `apps/server/src/config/env.ts`
  - `render.yaml`
  - `apps/server/.env.example`
  - `README.md`
  - `docs/architecture.md`
  - `apps/server/src/__tests__/clientIp.test.ts` (new)
- **Fix as implemented:**
  - **Shared resolver:** `createClientIpResolver` / `getClientIp` is now the single client key for guest quotas, the API rate limiter and the sign-in rate limiter.
  - **`CLIENT_IP_HEADER`:** a new optional env var naming a header to read the client IP from. It is used when it holds a valid IPv4/IPv6 address (first entry if comma-separated); otherwise the key falls back to `req.ip`, so `TRUST_PROXY` still applies.
  - **Production value:** `render.yaml` sets `CLIENT_IP_HEADER=cf-connecting-ip`, since `*.onrender.com` is served through Cloudflare (`CF-RAY` on every response). Cloudflare documents `CF-Connecting-IP` as the client IP that connected to its edge. A Cloudflare Worker can set this header, so it is not a security boundary, but it is adequate for a quota or rate-limit key.
  - **`LOG_CLIENT_IP_DIAGNOSTICS=true`** (default off) logs `req.ip`, `req.ips`, the socket address and the `X-Forwarded-For` / `CF-Connecting-IP` / `True-Client-IP` / `X-Real-IP` headers for the first 20 requests, so the real chain can be confirmed in Render logs.
- **Verification so far:**
  - The new tests show that with the header, one client arriving via three rotating proxy hops shares one rate-limit key (3rd request → 429) while another client keeps its own budget. Without the header the same traffic splits into three keys, which is the production symptom.
  - Fallback, IPv6, list and env-parsing cases are also covered.
  - Full server suite 255/255 passes (including the existing spoofed-X-Forwarded-For guest quota tests); `tsc --noEmit` and `eslint` are clean.
- **Post-deploy check (2026-11-22, deploy of `5222581` finished 11:32:18 UTC) — ❌ not yet effective:**
  - **Guest quota:** five no-AI guest session creates (`autoInitialize:false`, so quota is reserved then released and nothing is charged) alternated between the same two pre-existing windows, `resetAt` 10:18:35.441Z and 10:17:47.219Z, with `used: 3` in both. These are the same shared buckets the audit saw, so guests are still keyed on `req.ip`. The probe sessions were deleted (200).
  - **Rate limiter:** twelve health calls showed three independent countdowns (`r` = 99→94, 99→97, 99→97). The limiter's store is in-process memory, so this is also consistent with more than one instance running after the deploy. The quota result above is the reliable signal.
  - **Likely cause:** `CLIENT_IP_HEADER` didn't reach the service (it isn't Blueprint-managed, so `render.yaml` env changes aren't applied). Less likely: the variable is set but `CF-Connecting-IP` doesn't reach the app.
- **Re-check after `CLIENT_IP_HEADER=cf-connecting-ip` was added in the Render dashboard (redeploy finished 11:37:44 UTC) — ✅ verified:**
  - **Guest quota:** five no-AI guest session creates all reported one new window, `resetAt` 2026-11-23T11:38:43.053Z, with `used: 0` each time (reserve then release works). Before the change they alternated between the shared 10:17/10:18 windows. Probe sessions were deleted (200).
  - **Rate limiter:** `r` fell by exactly 2 per round (one create + one delete): 96 → 94 → 92 → 90 → 88. A plain health probe beforehand gave 99 → 98 → 97. One client is now one key.
  - **Confirmed:** `CF-Connecting-IP` reaches the app on Render, and the service is not Blueprint-managed. Env vars must be set in the dashboard; `render.yaml` documents the intended value.
- **Remaining housekeeping:** after reading the `Client IP diagnostics` log lines, set `LOG_CLIENT_IP_DIAGNOSTICS=false` (or remove it) in Render, since it logs client IPs. Old guest windows keyed on proxy addresses expire on their own within 24 h (TTL).

### LIVE-FIX-004 — Backend stability + honest "server unavailable" UX (BUG-H4, BUG-M4) — ✅ code implemented (not yet deployed); root cause still open
- **Status of the original plan:**
  - **(a) Find the outage cause — open, yours.** It needs Render's logs for 2026-11-22 ~10:42 and ~10:50 UTC, which only the account owner can see. The new logging below makes the next occurrence self-explaining.
  - **(b) Crash logging — done.** `apps/server/src/config/processGuards.ts` installs `unhandledRejection` / `uncaughtException` handlers from `index.ts`. They write a pino `fatal` log with the error and memory (RSS/heap MB), then exit with code 1, as Node would. Startup and SIGTERM logs now include memory, and SIGTERM also logs uptime, so a platform restart can be told apart from a crash.
  - **(c) Heap cap — done, differently.** The service isn't Blueprint-managed, so changing the Render start command means a dashboard edit. Instead the server's own `start` script, which Render already runs through `pnpm … start`, is now `node --max-old-space-size=384 dist/index.js`. A leak then ends in a logged "JavaScript heap out of memory" instead of a silent kill at the 512 MB instance limit.
  - **(d) Paid instance / keep-alive — open, yours.**
  - **(e) Honest client UX — done.** See below.
  - **(f) Practice retry of `PATCH /mode` — done through (e).** The failed mode switch and the auto-started generate both wait for the server and retry once, so no separate Practice change was needed.
- **Client behaviour (`apps/client/src/services/apiClient.ts`):**
  - **On a network error, probe `/health`.** If it answers, the error stands and the user still sees "Network error. Please check your internet connection." That's accurate: the problem is their connection.
  - **If `/health` is also down, wait.** The client treats the API as restarting and polls `/health` with back-off (2 s, 4 s, 8 s, then 15 s steps, about 90 s in total; `SERVER_WAKE_RETRY_DELAYS_MS`). A global banner ("Mentora's server is waking up. Retrying automatically…", `role="status"`) shows meanwhile. When the API answers, the original request is retried **once**.
  - **Shared wait:** requests that fail together share one wait and one banner.
  - **If the API never comes back:** the error becomes `SERVICE_UNAVAILABLE` (503), "Mentora's server is temporarily unavailable. Please try again in a minute." Practice titles it "Server Temporarily Unavailable".
  - **Interact streams aren't resent automatically,** since the server may have seen the turn. When the API is down they say "Mentora's server is restarting…", start the shared wait, and keep the Retry button.
  - **Test default:** the behaviour is on in the app and off by default under tests (`configureServerWake`); its own tests switch it on.
- **Verification:**
  - New `serverWake.test.tsx` (9 tests): wait-then-retry, no wait when `/health` answers, give up → `SERVICE_UNAVAILABLE`, one shared wait for concurrent failures, at most one retry, a mode switch recovering mid-restart, both Interact stream messages, and the banner.
  - New `processGuards.test.ts` (3 tests).
  - Full suites: client 159/159, server 258/258. Both `tsc --noEmit` runs and `eslint` are clean.
  - Not yet checked: the banner hasn't been looked at in a browser, and there's no live outage to test against.
- **Still to do:**
  1. Deploy.
  2. If an outage recurs, read the Render logs for a `fatal` line or the SIGTERM line with memory and uptime.
  3. Decide on (d).

### LIVE-FIX-005 — Enforce strike ordering server-side (BUG-M1) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/server/src/services/interact.service.ts` (`computeNextInteractState`)
  - `apps/server/src/ai/prompts/prompt.builder.ts` (Socratic protocol rules)
  - `apps/server/src/__tests__/interact.state-machine.test.ts`
- **Fix as implemented:**
  - **State machine.** Case C now triggers on `strikeCount >= 2` alone. By that point ADVANCE and OFF_TOPIC have already returned, so the remaining outcomes are STRIKE and CIRCUIT_BREAKER_ACK.
    - A model `CIRCUIT_BREAKER_ACK` at strike 0 or 1 falls through to the normal strike ladder (0→1, 1→2) and isn't marked as a direct explanation.
    - The manual "Explain this milestone directly" escape hatch (Case A) still breaks the circuit at any strike count.
  - **Prompt.** Rule 1 now says not to use `CIRCUIT_BREAKER_ACK` at Strike Count 0 or 1 unless the learner pressed Explain Directly, and that the server ignores it there. Rule 3 says that even after "I don't know", Strike 1 and 2 must leave the learner a question rather than the full explanation.
  - **What the server can't control:** the reply text is generated by the model and streamed live. If the model still gives a full answer at strike 1, the learner sees it, but the strike count and message flags now stay consistent, and the next "I don't know" gets the hint step before the circuit breaks.
- **Verification:**
  - **New unit tests:** `CIRCUIT_BREAKER_ACK` at strike 0 gives strike 1, and at strike 1 gives strike 2, both without the circuit-breaker flag. At strike 2 it still breaks the circuit.
  - **New stream test:** replays the live sequence ("I don't know" → STRIKE, then "No idea, sorry" → model `CIRCUIT_BREAKER_ACK`) and asserts `strikeCount: 2` in the SSE metadata and in MongoDB, with `isCircuitBreakerExplanation: false`.
  - **Old code fails them:** the three bug-case tests fail on the previous code and pass now.
  - **Full suite:** server 262/262; `tsc --noEmit` and `eslint` are clean. The existing strike 0→1→2→circuit-breaker and escape-hatch tests are unchanged and pass.

### LIVE-FIX-006 — Render or forbid math in milestone text (BUG-M2) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/client/src/components/common/InlineMathText.tsx` (new)
  - `apps/client/src/components/interact/MilestoneTrackerBar.tsx`
  - `apps/server/src/ai/prompts/prompt.builder.ts` (interact init prompt)
  - `apps/server/src/ai/schemas/interact.gemini-schema.ts` (field descriptions)
  - `apps/client/src/__tests__/InlineMathText.test.tsx` (new), `apps/server/src/__tests__/ai.prompt-router.test.ts`
- **Fix as implemented:**
  - **Client — render the math already stored.** Sessions created before the prompt change keep their LaTeX milestones, so the tracker has to handle them. A new `InlineMathText` component typesets only `$…$` / `$$…$$` spans with KaTeX and leaves everything else as plain text.
    - It replaces the plan's `RichMarkdownRenderer`. That component wraps output in `<div>`/`<p>`, which isn't valid inside the tracker's `<h3>`/`<p>` and would break `line-clamp`. It would also render Markdown in model text. `InlineMathText` emits only inline elements and never interprets Markdown or HTML.
    - Math detection follows Pandoc's rules (no space just inside the delimiters, no digit right after the closing `$`; `\$` is literal), so "costs $5 and $10" stays text.
    - TeX that doesn't parse is shown as its source rather than a red KaTeX error. KaTeX runs with `trust: false`.
    - The `title` tooltips (shown when `line-clamp` truncates) use `mathTextToPlain`, which swaps each math span for the text of KaTeX's MathML, e.g. `$\mathcal{O}(h)$` → "O(h)".
    - The tracker section now has `data-testid="milestone-tracker"`, as the verification step below assumes.
  - **Server — stop new LaTeX.** The interact init prompt now says milestone titles, descriptions and `normalizedTitle` are plain text: no LaTeX, `$` delimiters, Markdown or code, with notation named in words. It states that the opening question still follows the Technical Formatting Contract. The Gemini schema descriptions for those three fields say the same. `normalizedTitle` is included because it feeds the plain-text session header.
- **Verification:**
  - New `InlineMathText.test.tsx` (9 tests): segment splitting incl. currency and escapes, KaTeX output with no visible `$` or `\`, no block elements inside an `<h3>`, unparseable-TeX fallback, Markdown/HTML not interpreted, plain-text tooltips, and the tracker rendering the live Dijkstra/BST strings from this audit.
  - The tracker test fails on the old component and passes now. The prompt test asserts the new rule and its opening-question exception.
  - Full suites: client 168/168, server 262/262; `tsc --noEmit` and `eslint` clean on both.
  - **Not yet checked:** a browser look at the tracker, and whether the model now follows the plain-text rule. After deploy, start Interact on "Dijkstra's Algorithm" and "Binary Search Trees". For new sessions, `document.querySelector('[data-testid=milestone-tracker]').innerText` should contain no `$` or `\`. For the old audit session `6b02c5d961c7468ff04d15e1`, the tracker should show typeset math.

### LIVE-FIX-007 — Let chat bubbles shrink (BUG-M3) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/client/src/components/interact/ChatTranscript.tsx`
  - `apps/client/src/components/interact/StreamingBubble.tsx`
  - `apps/client/src/index.css`
  - `apps/client/src/__tests__/ChatBubbleOverflow.test.tsx` (new)
- **Fix as implemented:**
  - **All four bubbles, not two.** Saved assistant messages, saved user messages, the in-flight user message and the streaming bubble all get `min-w-0`. User bubbles render Markdown too, so a pasted table broke them the same way. Each bubble also gets `data-testid="chat-bubble"`.
  - **`break-words`** on each bubble. Once a bubble can shrink, a long unbroken token such as a URL would otherwise spill past its edge.
  - **Display math scrolls.** `.rich-markdown-renderer .katex-display` now has `overflow-x: auto`. Without it, a wide `$$…$$` formula would stick out of a narrowed bubble the same way the table used to widen it.
- **Verification:**
  - **New tests** in `ChatBubbleOverflow.test.tsx` (2): every bubble type carries `flex-1 min-w-0 break-words`, and tables stay inside their `overflow-x-auto` container. Both fail on the old code. jsdom has no layout engine, so these tests only pin the classes; the layout itself was checked in a browser.
  - **Browser check:** a temporary Vite harness (since removed) rendered `ChatTranscript` inside the workspace's real flex/overflow wrappers. Content was a 5-column table, a wide display formula and a long URL.

    | Width | Old classes: bubble width / right edge | Fixed: bubble width / right edge | Table | Display math | Page horizontal overflow |
    |---|---|---|---|---|---|
    | 390px | 725px / x=802 (row ends at 358) | 281px / x=358 | scrolls in a 246px box | scrolls in a 247px box (654px content). Without the CSS rule it reached x=748 | none |
    | 1440px | — | 724px (fills its 768px row) | fits, no scroll | fits | none |

    The old-code column was measured by removing `min-w-0`/`break-words` from the live DOM. The URL wraps inside the bubble.
  - **Full client suite:** 170/170. `tsc --noEmit` and `eslint src` are clean.
  - **Still to do after deploy:** at 390×844, open the guest Dijkstra session `6b02c5d961c7468ff04d15e1`. The strike-2 table message should fit its bubble and scroll horizontally.

### LIVE-FIX-008 — Display math normalisation (BUG-L1) — ✅ implemented (not yet deployed)
- **Target files:**
  - `apps/client/src/components/common/RichMarkdownRenderer.tsx`
  - `apps/client/src/__tests__/RichMarkdownRenderer.test.tsx`
- **Fix as implemented:**
  - **Rewrite before parsing.** A new exported `normalizeDisplayMath(content)` runs (memoised) before `ReactMarkdown`. It changes a line holding nothing but `$$…$$` into `$$` / body / `$$` on three lines, which remark-math renders as display math.
  - **Indentation is kept** on all three lines, so a formula inside a list item stays inside it.
  - **Fenced code is skipped.** The scan goes line by line and tracks ```` ``` ```` and `~~~` fences by CommonMark rules: up to 3 spaces of indent, and a closing fence must use the same character and be at least as long. Fenced content is never rewritten.
  - **Stricter than the planned regex.** The body may not contain an unescaped `$`, so a line like `$$a$$ and $$b$$` is left alone. The planned lazy `[^\n]+?` would have merged it into one bogus formula. Escaped `\$` is allowed. `$$…$$` inside a sentence stays inline, as remark-math intends.
  - **No blank lines needed.** Probing remark-math showed the three-line form renders as display math even when it interrupts a paragraph with no blank lines around it, which is how the model often writes it.
  - **Known limit:** a 4-space-indented (non-fenced) code block whose line is only `$$…$$` would be split into three lines. The formatting contract requires fenced code, so this is unlikely.
- **Verification:**
  - **New tests:** 5 render tests and 4 `normalizeDisplayMath` unit tests.
    - The render tests cover the audit case `a\n\n$$x=1$$\n\nb` and the live Dijkstra/Interact formulas with and without surrounding blank lines and with trailing spaces.
    - They also check list items, inline `$$` in a sentence, and `$$` inside ```` ``` ```` / `~~~` fences.
    - The unit tests cover indentation, the unchanged inputs (including `$$a$$ and $$b$$` and nested fences), escaped dollars, and resuming after a fence closes.
  - **Old code fails them:** with the normaliser bypassed, the three display-math render tests fail.
  - **Browser check:** a temporary Vite harness, since removed, rendered "The relaxation step:\n$$d[v] = d[u] + w(u, v)$$\n…". The output had one `.katex-display` with `text-align: center`, the formula visibly centred on its own line, and no `.katex-error`. The inline `$x = 1$` and in-sentence `$$y = 2$$` stayed inline.
  - **Full client suite:** 179/179. `tsc --noEmit` and `eslint src` are clean.
  - **Still to do after deploy:** Dijkstra Explain Card 2's relaxation formula should be centred.

### LIVE-FIX-009 — Copy button fallback & feedback (BUG-L2) — ✅ implemented (not yet deployed)
- **Target files:** `apps/client/src/components/common/CodeBlock.tsx`, `apps/client/src/__tests__/CodeBlockCopy.test.tsx` (new)
- **Fix as implemented:** If the Clipboard API is missing or rejects, `legacyCopy` copies through an off-screen `<textarea>` + `document.execCommand('copy')` and restores focus. If that fails too, the button shows "Copy failed" (amber) for 2 s. A visually hidden `role="status" aria-live="polite"` region announces both outcomes. The reset timer is cleared on re-click and on unmount.
- **Verification:** 4 new tests (API success, fallback on reject, fallback with no API, both fail → "Copy failed" → resets). Full client suite 183/183; `tsc --noEmit` and `eslint src` clean.
- **Still to do after deploy:** confirm in a browser where `writeText` is denied.

### LIVE-FIX-010 — Guest quota badge hydration (BUG-L4) — ✅ implemented (not yet deployed)
- **Target files:**
  - Server: `routes/quota.routes.ts` (new), `controllers/quota.controller.ts` (new), `middlewares/quota.middleware.ts` (`peekGuestQuota`), `app.ts`, `__tests__/guest-mode.routes.test.ts`
  - Client: `store/authSlice.ts` (`fetchGuestQuotaThunk`), `pages/WorkspacePage.tsx`, `__tests__/GuestQuotaHydration.test.tsx` (new)
- **Fix as implemented:**
  - **`GET /api/v1/quota`** (optional auth) returns `data.quota`. Guests get a strictly read-only view via `peekGuestQuota`: it creates, rolls over and reserves nothing. No record, or an expired one, reports `used: 0` with `resetAt` 24 h from now. Signed-in users get their synced window.
  - **Client:** `WorkspacePage` dispatches `fetchGuestQuotaThunk` for guests with no known quota. The result is dropped if the user signed in, or an AI action already reported fresher data, in the meantime. Failures are silent and the badge stays hidden as before.
  - Guest quota is keyed on the client IP (LIVE-FIX-003), so no guest token is needed and the badge also shows on the bare `/workspace` form.
- **Verification:** 4 new server tests (fresh guest creates no record, real usage with no reservation across 3 reads, expired window, signed-in user) and 3 new client tests (badge appears with 11/15 left, no call when quota is known, silent on failure). Server 266/266, client 186/186; `tsc --noEmit` and `eslint src` clean on both.
- **Still to do after deploy:** reload a guest session and confirm the badge shows without any AI action.

### LIVE-FIX-011 — Logout navigation (BUG-L6) — ✅ implemented (not yet deployed)
- **Target files:** `apps/client/src/components/layout/LeftHistorySidebar.tsx`, `apps/client/src/__tests__/WorkspaceShell.test.tsx`
- **Fix as implemented:** A new `handleLogout` runs `navigate('/workspace')`, `clearActiveSession()`, `logout()` and closes the mobile drawer, in the same transition-safe order as New Topic. The Sign out button uses it. LIVE-FIX-001's once-per-id fetch guard means the cleared session isn't re-fetched while the URL still holds its id.
- **Verification:** New test "signing out from a session lands on an empty /workspace with no stray fetch" checks the URL is `/workspace`, the empty topic form shows, there is no `GET /sessions/:id`, no "Session not found", and the user and active session are cleared. It fails on the old code (the URL stayed `/workspace/:id`). The test file's render helper now also shows the current path. Full client suite 187/187; `tsc --noEmit` and `eslint src` clean.
- **Still to do after deploy:** sign out from `/workspace/:id` on the live site and confirm there is no 401 in the console.

### LIVE-FIX-012 — Keyboard & focus accessibility (BUG-L5) — ✅ implemented (not yet deployed)
- **Target files:** `McqQuestionCard.tsx`, `ProfileSettingsModal.tsx`, `apps/client/src/__tests__/KeyboardFocusA11y.test.tsx` (new)
- **Fix as implemented:**
  - **(a) MCQ radiogroup:** roving `tabIndex`. The selected option (or the first, when none is selected) is the only Tab stop; all options are `-1` when disabled. ArrowDown/Right and ArrowUp/Left move focus and selection, wrapping at the ends. Space/Enter still select. That's about 10 Tab stops per batch instead of 40.
  - **(b) Profile modal:** on open, focus moves to the first `<select>`. Tab and Shift+Tab wrap inside the dialog, and focus that has escaped is pulled back in. On close, focus returns to the element that opened it.
- **Verification:** 6 new tests (single Tab stop, stop follows selection, arrow keys with wrap, Space/Enter, disabled, and the modal's focus-in, trap and restore). Full client suite 193/193; `tsc --noEmit` and `eslint src` clean.
- **Not done:** the axe-core scan and a keyboard-only run in a real browser. A CI axe check is suggestion #12.

### LIVE-FIX-013 — Explain auto-scroll, Mermaid theme, onboarding copy (BUG-L3, L7, L8) — ✅ implemented (not yet deployed)
- **Target files:** `ExplainStage.tsx`, `MermaidDiagram.tsx`, `OnboardingPage.tsx`, tests in `ExplainStage.test.tsx`, `auth-onboarding.test.tsx` and `MermaidTheme.test.tsx` (new)
- **Fix as implemented:**
  - **L3:** `handleNext` awaits `advanceExplainStepThunk`. When it succeeds, it scrolls the new card into view on the next animation frame, after the card has rendered. A failed advance doesn't scroll. `handleSelectStep` also tolerates environments without `scrollIntoView`.
  - **L7:** Mermaid uses `theme: 'dark'`. The diagram container is a dark slate panel everywhere it renders, so one fixed theme is enough.
  - **L8:** The "50% / 100% Completed" label is gone. The header shows "Step N of 2" and the bar, so step 2 no longer claims completion before submit.
- **Verification:** 3 new tests (Next scrolls `explain-card-2` smoothly to the top, Mermaid initialises with the dark theme, step 2 shows no "% completed" text). Full client suite 195/195; `tsc --noEmit` and `eslint src` clean.
- **Not checked:** the 3:1 edge contrast in a real browser, and the scroll position under the sticky bar. Both need a look on the deployed site.

---

## 6. Suggested Improvements

| # | Suggestion | Area | Impact | Effort |
|---|---|---|---|---|
| 1 | **"Server waking up" splash.** On first load, if `/health` takes more than 1.5 s, show a friendly banner with a progress indicator. Recruiters on a cold Render instance currently stare at a spinner, or at an error. | UI/UX | High | Quick Win |
| 2 | **Migrate guest sessions on sign-up/login.** Send `mentora_guest_tokens` to a `POST /sessions/claim` endpoint after auth, so the work done as a guest appears in the new history. | Feature | High | Moderate |
| 3 | **Show guest sessions in the sidebar** from `mentora_guest_tokens` (titles cached locally). Guests currently have no way back to an earlier session except the browser Back button. | UI/UX | High | Quick Win |
| 4 | **Stream Explain and Practice generation**, or show staged progress ("Drafting card 1/4…"). 6–13 s of an opaque spinner feels slow, while Interact already shows streaming works well. | Performance | High | Moderate |
| 5 | **Public landing / demo page** at `/` with a 20-second product GIF, the three-mode pitch and a "Try as guest" CTA. Today the first screen is a bare form. | UI/UX | High | Moderate |
| 6 | **Interact: show the learner's strike state accessibly** ("Hint level 1 of 2") without the internal jargon, so learners understand why the tutor escalates. | UI/UX | Medium | Quick Win |
| 7 | **Practice: per-question "Explain this" deep link** into Interact pre-seeded with the missed concept. | Feature | Medium | Moderate |
| 8 | **Progress & streaks dashboard** (sessions completed, average practice score per tier, milestones mastered). | Feature | Medium | Large |
| 9 | **Dark mode** — the app already has dark code and markdown surfaces, so a full theme would make them feel intentional and fix the dark-in-light nesting. | UI/UX | Medium | Moderate |
| 10 | **Export a session** (Markdown/PDF of cards, transcript and practice review) for revision. | Feature | Medium | Moderate |
| 11 | **`aria-live` region for streamed tutor replies** (announce when complete, not per token), plus a visible "Copied!"/"Copy failed" status. | Accessibility | Medium | Quick Win |
| 12 | **Add an a11y CI check**: axe-core in Playwright for `/workspace`, onboarding, the Practice review and the Profile modal. | Accessibility | Medium | Quick Win |
| 13 | **Mobile: bottom mode bar** (Explain / Interact / Practice) instead of header tabs, which frees the header for title + menu. | UI/UX | Medium | Moderate |
| 14 | **Lazy-load Mermaid and KaTeX** only when content contains them (Mermaid is large). Measure LCP before and after. | Performance | Medium | Quick Win |
| 15 | **Move the auth JWT to an `HttpOnly; Secure; SameSite` cookie** with CSRF protection, defence-in-depth on top of the existing strict CSP. | Performance/Security | Medium | Moderate |
| 16 | **Uptime monitor + status badge** (e.g. a ping to `/health` every 5 min with alerting) so outages like the two observed get noticed. | Performance | Medium | Quick Win |
| 17 | **Explain: "Previous" button and keyboard shortcuts** (→ / ←) for card navigation. | Accessibility | Low | Quick Win |
| 18 | **Practice: question navigator chips** (1–10, answered/unanswered) at the top for long batches on mobile. | UI/UX | Low | Quick Win |
| 19 | **Rename "Personalized Learning — Sign up to save topics"** to state the concrete benefit ("50 daily actions + saved history"). | UI/UX | Low | Quick Win |
| 20 | **Show quota cost before acting**, e.g. "Uses 1 of 13 remaining" under Send and Generate. | UI/UX | Low | Quick Win |

---

*Cleanup note:* to remove the audit data, delete the test account `audit_test_1795344556883@example.com` and its remaining session "Deadlocks in Operating Systems", plus guest session `6b02c5d961c7468ff04d15e1` (expires with its guest token, but the document persists until TTL/cleanup).
