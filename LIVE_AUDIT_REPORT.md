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

### LIVE-FIX-002 — Responsive session header (BUG-H1)
- **Target files:**
  - `apps/client/src/components/layout/StickyTopicHeader.tsx` (35-82)
  - `apps/client/src/components/layout/ModeSwitcherTabs.tsx`
- **Exact fix:**
  - Below `sm`, use two rows: `flex-wrap`, or `grid grid-cols-[auto_1fr_auto]` with the tabs on a full-width second row (`order-last w-full sm:w-auto sm:order-none`).
  - Remove `flex-shrink-0` from the right group below `sm`.
  - Use short tab labels below `sm` ("Explain / Interact / Practice").
  - For guests below `sm`, collapse "Get Started" to an icon button with `aria-label`, or move it into the drawer.
  - Give the title `min-w-0 flex-1` so it truncates instead of collapsing to 0.
- **Verification:**
  - At 390×844, guest and authenticated: `document.documentElement.scrollWidth === 390`, and no header descendant has `getBoundingClientRect().right > 390`.
  - `elementFromPoint` at the hamburger's centre returns the hamburger, and tapping it opens the drawer.
  - The `<h1>` width is > 0.
  - Add a Playwright mobile snapshot.

### LIVE-FIX-003 — Correct guest identity for quota & rate limiting (BUG-H2)
- **Target files:**
  - `apps/server/src/config/env.ts` (17-21)
  - `apps/server/src/app.ts` (32-33, rate limiter ~47)
  - `apps/server/src/middlewares/quota.middleware.ts` (43-50)
  - `.env.example` / Render env
- **Exact fix:**
  1. Temporarily log `req.ips`, `req.ip` and `req.headers['x-forwarded-for']` for one request in production to count the real proxy chain (Cloudflare → Render router → app).
  2. Set `TRUST_PROXY` to that hop count in the Render dashboard, or switch to a trusted-header strategy that reads the client IP from the header Render sets for the original client, only when the request came through Render.
  3. Document the chosen value in `.env.example`.
  4. Optionally add the guest-token `sid` as a secondary key so one browser can't spread usage across IPs.
- **Verification:**
  - Five consecutive guest actions from one browser return the same `quota.resetAt`, and `used` increments by exactly 1 each time.
  - A second network (e.g. phone hotspot) gets its own window.
  - The 16th action returns `429 DAILY_QUOTA_EXCEEDED`.
  - Add a unit test for `getGuestIdentifier` with a multi-hop `X-Forwarded-For`.

### LIVE-FIX-004 — Backend stability + honest "server unavailable" UX (BUG-H4, BUG-M4)
- **Target files:**
  - `render.yaml` (5, 9)
  - `apps/server/src/index.ts` (50-62)
  - `apps/client/src/services/apiClient.ts` (225-236, health probe ~319)
  - `apps/client/src/components/practice/PracticeStage.tsx`
  - `apps/client/src/store/sessionSlice.ts` (mode switch)
- **Exact fix:**
  - **(a)** Pull Render logs for 2026-11-22 10:42 and 10:50 UTC to identify the cause (OOM, crash or platform hibernation).
  - **(b)** Add `process.on('unhandledRejection' | 'uncaughtException')` handlers that log with pino before exiting.
  - **(c)** Start with `node apps/server/dist/index.js` instead of the pnpm wrapper, and set `NODE_OPTIONS=--max-old-space-size=384`.
  - **(d)** Consider a paid instance or an external keep-alive for demos.
  - **(e)** Client: on a status-0 error, call `GET /health`. If that also fails, show "Mentora's server is waking up — retrying…" and retry with exponential back-off (e.g. 2 s, 4 s, 8 s, up to ~90 s) before surfacing an error.
  - **(f)** Make "Retry" in Practice re-issue the pending `PATCH /mode` as well.
- **Verification:**
  - With the API URL pointed at a host that returns 503 (or Render suspended), the UI shows the waking-up state and recovers by itself when the API comes back.
  - Render logs show no restarts over a 30-minute scripted session.

### LIVE-FIX-005 — Enforce strike ordering server-side (BUG-M1)
- **Target files:**
  - `apps/server/src/services/interact.service.ts` (156-166)
  - `apps/server/src/__tests__/…interact…` (unit test)
- **Exact fix:**
  - Replace the Case C condition with `if (strikeCount >= 2 && (outcome === CIRCUIT_BREAKER_ACK || outcome === STRIKE))`.
  - When the model returns `CIRCUIT_BREAKER_ACK` with `strikeCount < 2`, treat it as `STRIKE` (fall through to Case D).
  - Optionally add a line to the prompt: "Never emit CIRCUIT_BREAKER_ACK unless Current Strike Count is 2 or Manual Explain is YES."
- **Verification:**
  - Unit test: `computeNextInteractState({strikeCount:1, outcome:CIRCUIT_BREAKER_ACK, forceDirectExplanation:false})` returns `nextStrikeCount: 2, isCircuitBreakerExplanation: false`.
  - Existing tests for strike 0→1→2→CB and the escape hatch still pass.

### LIVE-FIX-006 — Render or forbid math in milestone text (BUG-M2)
- **Target files:**
  - `apps/client/src/components/interact/MilestoneTrackerBar.tsx` (150-172)
  - `apps/server/src/ai/prompts/prompt.builder.ts` (interact init prompt)
- **Exact fix:**
  - Render title and description with `RichMarkdownRenderer` (KaTeX only; keep `line-clamp`).
  - Also instruct the init prompt: "Milestone titles and descriptions must be plain text — no LaTeX or Markdown."
- **Verification:** Start Interact on "Dijkstra's Algorithm" and "Binary Search Trees". The tracker contains no `$` or `\` characters (`document.querySelector('[data-testid=milestone-tracker]').innerText`).

### LIVE-FIX-007 — Let chat bubbles shrink (BUG-M3)
- **Target files:**
  - `apps/client/src/components/interact/ChatTranscript.tsx:97`
  - `apps/client/src/components/interact/StreamingBubble.tsx:31`
- **Exact fix:** Add `min-w-0` to both `flex-1` bubble containers.
- **Verification:** At 390px, a message containing a 4-column table has a bubble width ≤ its row width, and the table scrolls horizontally inside `.rich-table-container`.

### LIVE-FIX-008 — Display math normalisation (BUG-L1)
- **Target file:** `apps/client/src/components/common/RichMarkdownRenderer.tsx`
- **Exact fix:** Before passing `content` to `ReactMarkdown`, run `content.replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, '$$$$\n$1\n$$$$')`. This turns standalone single-line `$$…$$` into block math, outside fenced code blocks (split on ``` fences first).
- **Verification:** A unit test renders `"a\n\n$$x=1$$\n\nb"` and expects `.katex-display`. Live: Dijkstra Card 2's relaxation formula is centred.

### LIVE-FIX-009 — Copy button fallback & feedback (BUG-L2)
- **Target file:** `apps/client/src/components/common/CodeBlock.tsx:25-35`
- **Exact fix:** On a rejected or missing Clipboard API, fall back to a hidden `<textarea>` + `document.execCommand('copy')`. If that fails too, set state to "Copy failed" for 2 s. Add `aria-live="polite"` to the status text.
- **Verification:** RTL test with `navigator.clipboard.writeText` mocked to reject shows "Copy failed" or the fallback success.

### LIVE-FIX-010 — Guest quota badge hydration (BUG-L4)
- **Target files:**
  - `apps/client/src/components/layout/QuotaBadge.tsx:12-13`
  - `apps/server/src/controllers/session.controller.ts` (or a new `GET /quota`)
- **Exact fix:** Add a lightweight `GET /api/v1/quota` (or include `meta.quota` in `GET /sessions/:id` for guests) that reads, without reserving, `syncGuestQuotaWindow`. Dispatch `setQuota` on workspace mount for guests.
- **Verification:** A guest reloads `/workspace/:id`; the badge renders the server value immediately.

### LIVE-FIX-011 — Logout navigation (BUG-L6)
- **Target file:** `apps/client/src/components/layout/LeftHistorySidebar.tsx:334`
- **Exact fix:** `onClick={() => { navigate('/workspace'); dispatch(clearActiveSession()); dispatch(logout()); }}`, using the same transition-safe pattern as LIVE-FIX-001.
- **Verification:** Logging out from `/workspace/:id` lands on an empty `/workspace` with no 401 in the console.

### LIVE-FIX-012 — Keyboard & focus accessibility (BUG-L5)
- **Target files:**
  - `apps/client/src/components/practice/McqQuestionCard.tsx:86-110`
  - `apps/client/src/components/layout/ProfileSettingsModal.tsx:62-82`
- **Exact fix:**
  - **(a)** Roving `tabIndex` (selected option, or the first one, gets `0`; the others `-1`). ArrowUp/Down/Left/Right move focus and selection within the group.
  - **(b)** On open, focus the first `<select>`. Trap Tab inside the dialog, and restore focus to the trigger on close.
- **Verification:** Keyboard-only run through a 10-question batch (about 10 Tab stops instead of 40), plus an axe-core scan with no `aria-dialog`/focus violations.

### LIVE-FIX-013 — Explain auto-scroll, Mermaid theme, onboarding copy (BUG-L3, L7, L8)
- **Target files:**
  - `ExplainStage.tsx:43-57`
  - `MermaidDiagram.tsx:14-17`
  - `OnboardingPage.tsx`
- **Exact fix:**
  - After `advanceExplainStepThunk` resolves, call `handleSelectStep(nextStepIndex)`.
  - Use `theme: 'dark'` (or `base` with `themeVariables` matching slate-900) when rendered inside a dark container.
  - Change the step-2 progress text.
- **Verification:**
  - Clicking Next scrolls the new card under the sticky bar.
  - Mermaid edges have a contrast ratio of 3:1 or more against `#0f172a`.
  - Onboarding step 2 doesn't claim 100% before submit.

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
