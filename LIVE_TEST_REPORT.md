# Mentora — Live Test Report

**Date:** 2026-11-20 · **Type:** Black-box browser test of the live deployment (no code, config or deployment changed)

## 1. Overview

| | |
|---|---|
| Product | Mentora — AI tutor with Explain / Interact / Practice modes (React + Express + MongoDB + Gemini) |
| Live client | https://mentoraclient.vercel.app/ (Vercel) |
| Live API | `https://mentora-server-bxgm.onrender.com/api/v1` (Render free plan; URL read from the live JS bundle) |
| Sources of truth | `docs/requirement.md` (FR-001…019, BR-01…04, NFR-001…005), `README.md`, `docs/architecture.md` |

## 2. Environment and limits of this test

- Browser: Claude desktop built-in browser (Chromium), desktop and 375×812 mobile emulation. **No Firefox/Safari testing was possible.**
- **No account was created and no credentials were available**, so every login-gated requirement (registration, onboarding, profile, session history, per-user quota) is **BLOCKED**. Everything else was tested as a **guest** (the live app's default mode).
- Guest quota is 15 AI actions/day/IP; roughly 13 were consumed by this test, so quota-exhaustion behaviour (BR-04) was not reached.
- Performance numbers are single observations from one machine, not benchmarks. No Lighthouse run.
- One session (`6b0055f4…`) was created and later deleted by me. No other session was read or changed.
- **The live deployment is older than the local branch** (`fix/phase1-guest-security`, HEAD `e56d124`). Live health returns `{status, uptime}` with no `db` field, the guest-token header is not used, and the client's Interact-init timeout is 30 s (branch: 45 s). Findings below describe **what is live**, not what is in the branch.

## 3. Functional requirements

| Requirement | Expected | Actual (live) | Status |
|---|---|---|---|
| FR-001 Register/login/logout | Email+password auth | Forms validate inline (bad email, short name/password), wrong login → 401 "Invalid email or password", malformed login → 400, bad JWT → 401. Successful register/login/logout **not exercised** | BLOCKED |
| FR-002 / BR-01 Onboarding | Mandatory 2-step profile | `/onboarding` redirects a guest to `/login`. Flow itself not seen | BLOCKED |
| FR-003 Profile edit | View/modify profile | Needs account | BLOCKED |
| FR-004 Topic initiation | Free-text topic + mode | Topic + mode → session created, Explain cards shown (~14 s incl. AI). 501-char topic rejected (400, max 300) | PASS |
| FR-005 Mode switching | Persistent tabs, state kept | Switching Explain→Interact→Practice kept topic; Explain cards, chat, quiz draft all survived reload; last mode restored | PASS |
| FR-006 History sidebar | List/reopen/delete sessions | Guests see "No history in guest mode" (by design). Authenticated list/delete not tested | BLOCKED |
| FR-007 Explain 4 cards | Intuition→Mechanism→Example→CFU | 4 cards in order, one revealed per Next, progress bar works | PASS |
| FR-008 Next / Go Deeper | Sub-card under current card | Go Deeper added a sub-card in ~10.7 s with "Generating deeper breakdown…" state; sequence not reset | PASS |
| FR-009 Rich rendering | Markdown, LaTeX, code, diagrams | KaTeX, Mermaid diagrams and tables render in all three modes. **Code blocks not seen** in generated content | PARTIAL |
| FR-010 Milestones | 3–5 milestones + opening question | 4 milestones with states, opening diagnostic question | PASS |
| FR-011 Streaming | Progressive streaming, rich text | Replies render with diagrams/tables/math. Token-by-token streaming and latency not measured reliably | PARTIAL |
| FR-012 3-strike breaker | Nudge → hint → direct explanation | Strike 2 (hint + two-choice) and Strike 3 (direct explanation + confirmation question) correct. Strike 1 already listed two of the four answers (more than a nudge). Replies expose wording like "our second strike" / "circuit breaker protocol" (L-06) | PARTIAL |
| FR-013 Explain directly | Manual bypass control | Button gave a direct explanation + confirmation check | PASS |
| Milestone advance (AC-INT-03) | Correct answer completes milestone | Correct answer → "1 of 4 Completed", Milestone 2 active | PASS |
| FR-014 Tiered 10-MCQ batches | Easy→Medium→Hard | Easy (≈10 s) and Medium (≈46 s) generated, 10 questions × 4 options. Hard never run | PARTIAL |
| FR-015 MCQ UI + hint | A–D options, optional hint | 10 radiogroups × 4 options, Show Hint works, Submit disabled until all answered | PASS |
| FR-016 Review + unlock | Score, choice, correct, explanation, unlock | "3 / 10 (30%)", per-question Your Choice / Correct Option / explanation, Medium unlocked | PASS |
| BR-02 Tier lock | Sequential unlock | `submit hard` and `generate hard` before Medium → 409 `TIER_LOCKED` | PASS |
| BR-03 Hide answers pre-submit | No key before submit | Session JSON during quiz has no correct index or explanation | PASS |
| FR-017 / NFR-003 Reasoning before key | Explanation consistent with key | 2 of 10 reviewed explanations were consistent; server-side ordering not verifiable from the browser | NOT VERIFIABLE |
| FR-018 Guardrail | Politely refuse off-topic/unsafe | Spam-email request refused politely and redirected. But it was treated as a failed attempt and triggered a direct explanation (L-06) | PARTIAL |
| FR-018 / BR-04 Daily quota | Enforce, show reset message | Not reached; no quota indicator visible to guests | BLOCKED |
| Edge 5: refresh mid-quiz | Selections kept | 3 selections restored after reload; draft cleared after submit | PASS |
| Edge 3: diagram failure fallback | Text fallback | Not triggered | NOT VERIFIABLE |
| Edge 4: stream interruption | "Connection interrupted — Retry" | Not triggered. A timeout on Interact init showed "Failed to Initialize… Retry Initialization", and Retry worked (L-02) | NOT VERIFIABLE |
| Routing | Guards, unknown routes | Protected route → `/login`; unknown path → silently `/workspace`; foreign session ID → misleading error (L-07, L-12) | PARTIAL |
| NFR-005 Isolation | Sessions isolated per owner | **Guest sessions readable, modifiable and deletable with no credentials** (L-01) | FAIL |

**Answer: the platform does not yet verifiably fulfil all functional requirements.** The three core learning modes work well end to end as a guest. Authenticated flows could not be tested, and one security requirement (isolation) fails on the live deployment.

## 4. Non-functional summary

**UI/UX / accessibility** — Clean, consistent layout; labelled form fields with correct `autocomplete`; mode tabs use `role=tab`; MCQ uses `role=radio` and is focusable; mobile drawer is a `role=dialog` with backdrop; no horizontal overflow at 375 px. Weaknesses: raw Zod messages in forms and not announced (`role=alert` absent); several mobile touch targets are 26–32 px (above the WCAG 2.2 AA 24 px minimum, below the 44 px comfort size); focus does not move into the mobile drawer on open (programmatic check only); no 404 page. Colour contrast was not measured. Full keyboard walkthrough not performed.

**Performance** (single run) — Main JS 1.79 MB decoded / 576 KB brotli; DOMContentLoaded 668 ms (cached CDN, `x-vercel-cache: HIT`). Mermaid/KaTeX load as separate chunks. API: session list GET ≈1 s; step navigation ≈0.8–1.4 s; Go Deeper ≈10–13 s; Easy batch ≈10 s; Medium batch ≈46 s; session create with Explain ≈14 s. **Render cold start: first `/health` took 33 s**; later a ~1 min outage returned 503 (see L-03).

**Security** — Good: unauthenticated `/sessions` list and `/auth/me` → 401; bad JWT → 401; CORS limited to the Vercel origin with no wildcard; helmet headers + HSTS on API; auth/api rate limit headers present (`100-in-15min`); input length and answer-range validation. Bad: L-01 (P0), L-09 (frontend headers), L-05 (500 on malformed JSON).

**Reliability** — Persistence across reload is solid. Failures: Interact init timeout (L-02), cold start/503 (L-03). During the 503 the browser surfaced a CORS error because the error response had no CORS header.

**Compatibility** — Chromium only. Other browsers NOT TESTED.

## 5. UI/UX suggestions
1. Show human-readable validation text and mark errors `role="alert"` / `aria-describedby`.
2. Do not let tutor text mention internal mechanics ("strike", "circuit breaker protocol").
3. Add a real "not found / not yours" state for session URLs and a 404 route.
4. Show guest quota (e.g. "9 of 15 left today") and a first-request "waking server…" message for cold starts.
5. Raise touch targets (Show Hint, mode tabs, drawer toggle) to ≥44 px on mobile; move focus into the drawer when it opens.
6. Replace "the first option" style references in explanations with the option text (options are static, but the wording is fragile).

## 6. Backend suggestions (verified vs. to investigate)
- **Verified:** malformed JSON body → 500 (should be 400); guest isolation absent on live; health lacks DB state on live; error responses during outage lack CORS headers.
- **Needs investigation:** `docs`/audit items already tracked in `PROJECT_AUDIT_REPORT.md` (quota race, unbounded prompt history, list query payload, repeated `User` lookups). Not re-verified here at runtime.

## 7. Confirmed issues (prioritised)

| ID | Pri | Category | Issue | Evidence |
|---|---|---|---|---|
| L-01 | **P0** | Security | Any client can read, modify (mode, quiz submit) and **delete** a guest session knowing only its ID; guest token not used on live | `GET /sessions/{id}` → 200 with no headers; `DELETE` → 200 `{deletedId}`, subsequent GET → 401; `sessionStorage` empty after creating a session; `POST practice/submit` → 200 without token |
| L-02 | **P1** | Reliability | Interact init exceeds the live client's 30 s timeout → "Request timed out"; server work continues (quota still charged); Retry then succeeded | `interact/init` aborted at 30 011 ms (status 0); UI "Failed to Initialize Interact Mode" |
| L-03 | **P1** | Reliability | Render free-plan cold start (33 s first request) and a ~1 min period of 503 responses; browser shows a CORS error instead of a usable message | First `/health` 33 412 ms; later 503s then 200; console CORS error |
| L-04 | **P1** | Process | Live deploy lags the repo (health shape, timeouts, guest-token fix). Fixes in the branch are not live | Health body lacks `db`; client timeout 30 s vs 45 s in `config/timeouts.ts` |
| L-05 | P2 | Backend | Malformed JSON body → 500 `INTERNAL_SERVER_ERROR` | `POST /auth/login` body `{bad` → 500 |
| L-06 | P2 | Functional | Off-topic message counts as a failed attempt and triggers the direct-explanation path; tutor leaks "second strike" / "circuit breaker" wording | Transcript after spam prompt: "Direct explanation provided after guided Socratic review" |
| L-07 | P2 | UX | Unknown/foreign session URL shows "Unable to start session — Authentication required" | `/workspace/000000000000000000000000` |
| L-08 | P2 | Performance | Single 1.79 MB main bundle | resource timing |
| L-09 | P2 | Security | Vercel frontend sends no CSP, `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors or `Referrer-Policy` | `/` response headers |
| L-10 | P2 | A11y/UX | Raw Zod messages ("Too small: expected string to have >=2 characters"), not announced to screen readers | `/register` |
| L-11 | P3 | A11y | Touch targets 26–32 px on mobile; drawer does not take focus | 375 px measurement |
| L-12 | P3 | UX | Unknown routes silently redirect to `/workspace` | `/does-not-exist` |
| L-13 | P3 | UX | Guests see no quota indicator or reset message | Guest workspace |
| L-14 | P3 | Content | Occasional AI wording errors ("Bankier's Algorithm") | Explain card 3 |

All items above were observed directly, except that L-11's drawer-focus part is a programmatic check only.

## 8. Overall health

**Core product: good. Deployment: not ready for public traffic.** Explain, Interact (milestones, strikes, direct explain), Practice (tiering, review, draft persistence) all work and the generated content is coherent and well rendered. However the live build has an open P0 (guest session isolation), unreliable first-request/timeout behaviour on the free Render plan, and a large untested area (all authenticated flows). Do not describe the platform as fully verified until an account-based pass (registration → onboarding → profile → history → quota) is run on a staging environment and the branch fixes are deployed and re-tested.
