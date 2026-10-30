# AGENTS.md — Project-Wide Coding Rules for Mentora

**Document Version:** 1.1.0  
**File Location:** Repository Root (`/AGENTS.md`)  
**Target Audience:** AI Coding Agents & Software Engineers  

---

## A. Project Context and Source of Truth

**Mentora** is a cloud-native, AI-powered personalized web tutoring application built on a TypeScript MERN stack monorepo (`@mentora/shared`, `@mentora/server`, `@mentora/client`) and deployed across **Vercel** (frontend), **Render** (backend), and **MongoDB Atlas** (database), powered by the **Google Gemini API**. It enables learners to master any topic through three integrated pedagogical modes: **Explain Mode** (progressive 4-card breakdown + `Go Deeper`), **Interact Mode** (milestone-driven Socratic dialogue with a deterministic 3-Strike Circuit Breaker via SSE), and **Practice Mode** (tiered 10-question MCQ batches across Easy $\rightarrow$ Medium $\rightarrow$ Hard).

### Document Hierarchy
1. **`requirement.md` (`product_requirement.md`)** is the **source of truth** for product behavior, functional requirements (`FR-*`), non-functional requirements (`NFR-*`), business rules (`BR-*`), and acceptance criteria (`AC-*`).
2. **`architecture.md`** is the **source of truth** for system design, monorepo workspace boundaries, data models, REST/SSE contracts, and AI routing architecture.
3. **`AGENTS.md`** defines mandatory development rules, coding conventions, repository practices, and implementation constraints.

### Mandatory Consultation & Conflict Resolution
* Coding agents **MUST** consult the relevant sections of `requirement.md` (`product_requirement.md`) and `architecture.md` before implementing or modifying any feature.
* **Repository State Note:** If inspecting the workspace prior to Phase 1 scaffolding, only the core specification artifacts exist; agents **MUST** adhere strictly to the workspace layout defined in Section B.2 of `architecture.md` when creating files.
* If documents conflict or a task instruction contradicts an established architectural decision, agents **MUST** explicitly identify the conflict and propose an architecture-consistent resolution rather than silently introducing an incompatible design.
* If individual workspaces (`apps/server` or `apps/client`) grow substantially in the future, directory-scoped `AGENTS.md` files **MAY** be introduced, but agents **MUST NOT** create additional instruction files unless explicitly requested.

---

## B. Technology Stack and TypeScript Standards

### Approved Technology Stack (`architecture.md`)
* **Monorepo Workspaces:** `pnpm` or `npm` workspaces (`packages/shared`, `apps/server`, `apps/client`).
* **Frontend (`@mentora/client` — Vercel):** React 18+, Vite, TypeScript, Tailwind CSS, Redux Toolkit, React Router v6, Axios, native `fetch` + `ReadableStream` for SSE, `react-markdown` (`remark-gfm`, `remark-math`, `rehype-katex`), syntax highlighter (`shiki` or `react-syntax-highlighter`), and `mermaid`.
* **Backend (`@mentora/server` — Render):** Node.js 20 LTS, Express.js, TypeScript, Mongoose (MongoDB Atlas), `@google/genai` (official Google Gen AI SDK), `jsonwebtoken` (`HS256` Bearer JWT), `bcryptjs` (cost factor 12), `zod`, `pino`, `helmet`, `cors`, `express-rate-limit`.
* **Testing:** Vitest, Supertest, `mongodb-memory-server`, React Testing Library.

### TypeScript & Code Quality Rules
* **Strict TypeScript:** All workspaces **MUST** inherit `tsconfig.base.json` with `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`, and `"noUncheckedIndexedAccess": true`. Agents **MUST NOT** weaken compiler flags or use `@ts-ignore` / `@ts-expect-error` to silence type errors.
* **No `any`:** Agents **MUST NOT** use `any`. Use explicit interfaces from `@mentora/shared`, generics, or `unknown` paired with runtime Zod parsing or type-guard narrowing.
* **Safe Assertions:** Avoid unsafe type assertions (`as SomeType`) and non-null assertions (`!`) unless immediately preceded by an explicit guard check that guarantees safety.
* **Immutability & Simplicity:** Prefer immutable data transformations (`map`, `filter`, object spread, Redux Toolkit Immer updates) and functional composition where appropriate. Avoid unnecessary mutation, duplicated logic, and deeply nested functions.
* **Cohesion & Explicit Contracts:** Use clear, domain-accurate names, small cohesive functions, and single-responsibility modules. Prefer explicit function signatures and DTO contracts over implicit dependencies.
* **Dependency Discipline:** Avoid premature abstractions and redundant packages. Agents **MUST NOT** introduce new third-party libraries without a clear architectural justification (e.g., never install deprecated `@google/generative-ai` instead of `@google/genai`, and never add competing state managers alongside Redux Toolkit).

---

## C. Repository and Folder Structure Conventions

Agents **MUST** follow the monorepo layout established in Section B.2 of `architecture.md` and **MUST NOT** create competing directories for the same responsibility.

### 1. Shared Package (`packages/shared/src/`)
* `/enums` — Shared domain enumerations (`EducationLevel`, `ExplanationStyle`, `LearningMode`, `PracticeTier`, `MilestoneStatus`).
* `/schemas` — Runtime Zod validation schemas (request payloads, domain entities, and Gemini structured output schemas).
* `/types` — Inferred TypeScript interfaces and DTOs (`z.infer<typeof Schema>`), API response envelopes, and SSE event payloads.
* `/constants` — Shared business constants (`DAILY_AI_QUOTA_LIMIT = 50`, `MAX_SOCRATIC_STRIKES = 3`, `MCQ_BATCH_SIZE = 10`).

### 2. Backend Application (`apps/server/src/`)
* `/config` — Startup Zod environment validation (`env.ts`), MongoDB connection setup, and Pino logger configuration.
* `/middlewares` — Request-processing middlewares (`auth.middleware.ts`, `quota.middleware.ts`, `validate.middleware.ts`, `error.middleware.ts`).
* `/routes` — Express route definitions (`/api/v1/*`) wiring paths, middlewares, and controller handlers.
* `/controllers` — Thin HTTP and SSE transport handlers.
* `/services` — Core business logic and pedagogical state machines (`auth.service.ts`, `session.service.ts`, `explain.service.ts`, `interact.service.ts`, `practice.service.ts`).
* `/ai` — Exclusive integration layer for `@google/genai` (`gemini.client.ts`, `model.router.ts`, `prompts/`, `schemas/`).
* `/models` — Mongoose schemas and models (`User.model.ts`, `TopicSession.model.ts`).
* `/repositories` — Data-access abstraction encapsulating all Mongoose queries.
* `/utils` — Small reusable helpers (`AppError.ts`, `asyncHandler.ts`, SSE frame formatters).

### 3. Frontend Application (`apps/client/src/`)
* `/routes` — `AppRouter.tsx`, `ProtectedRoute.tsx`, and `OnboardingGuard.tsx`.
* `/store` — Redux Toolkit store, typed hooks (`useAppDispatch`, `useAppSelector`), and slices (`authSlice.ts`, `sessionSlice.ts`, `uiSlice.ts`).
* `/services` — Centralized Axios REST client and `fetch`-based SSE stream client.
* `/pages` — Route-level views (`LoginPage.tsx`, `RegisterPage.tsx`, `OnboardingPage.tsx`, `WorkspacePage.tsx`).
* `/components` — Feature and layout components:
  * `/layout` — `AppShell`, `LeftHistorySidebar`, `StickyTopicHeader`, `ModeSwitcherTabs`, `QuotaBadge`.
  * `/common` — `RichMarkdownRenderer`, `MermaidDiagram`, `KaTeXBlock`, `CodeBlock`, `ErrorBoundary`.
  * `/explain`, `/interact`, `/practice` — Mode-specific UI components.
* `/hooks` — Reusable custom hooks (`useSseStream.ts`, `useQuizDraftPersistence.ts`, `useQuotaStatus.ts`).
* `/utils` — Pure helper functions and `localStorage` utilities.

### Naming, Export, and Import Rules
* **Naming:** Use `PascalCase.tsx` for React components, `useCamelCase.ts` for React hooks, and `dot.case.ts` or `kebab-case.ts` for backend modules (`explain.service.ts`, `auth.middleware.ts`).
* **Exports:** Prefer named exports across shared types, services, utilities, and UI components.
* **Cross-Package Imports:** Both `apps/client` and `apps/server` **MUST** import shared contracts via the package alias `@mentora/shared`—never via deep relative paths (`../../../packages/shared/...`).
* **New Folders:** A new subfolder is justified only when introducing a distinct architectural sub-domain approved in `architecture.md`.

---

## D. Shared Types and Validation

* **Single Source of Truth (`@mentora/shared`):** Agents **MUST** reuse existing interfaces, types, enums, constants, and Zod schemas from `@mentora/shared`.
* **Zero Duplication:** Agents **MUST NOT** redefine local interfaces in `apps/client` or `apps/server` for `User`, `StaticLearnerProfile`, `TopicSession`, `ExplainCard`, `DeepDiveSubCard`, `InteractMilestone`, `InteractMessage`, `PracticeBatch`, or `McqQuestion`.
* **No Magic Literals:** Do not hardcode education levels (`'high_school'`, `'undergraduate'`, `'professional'`), explanation styles (`'visual'`, `'analogy_heavy'`, `'concise_technical'`), batch statuses, or quota/strike limits; always import the shared enums and constants.
* **Schema-First Inference:** Define Zod schemas in `packages/shared/src/schemas/` first and infer TypeScript types using `z.infer<typeof Schema>`.
* **Runtime Validation of Untrusted Input:** Never assume TypeScript compile-time types guarantee runtime validity. Validate all untrusted inputs using Zod at:
  1. Express HTTP boundaries (`req.body`, `req.params`, `req.query`) via `validate.middleware.ts`.
  2. Google Gemini API structured JSON outputs before database persistence.
  3. Frontend `localStorage` hydration (e.g., mid-quiz draft arrays in `useQuizDraftPersistence`).

---

## E. Error Handling and Logging

### Backend Error Handling (`apps/server`)
* **Centralized Error Middleware:** All Express routes **MUST** wrap async handlers with `asyncHandler` and forward errors to `error.middleware.ts`. Never silently swallow exceptions or return HTTP `200 OK` with `{ success: false }`.
* **Custom `AppError` Class:** Expected operational errors **MUST** throw `new AppError(statusCode, errorCode, message, details?)`, cleanly separating operational errors from unexpected internal crashes (`500 INTERNAL_SERVER_ERROR`).
* **Standard Error Envelope & HTTP Status Codes:**
  * Return `{ success: false, error: { code, message, details? } }`.
  * `400 VALIDATION_ERROR` — Invalid request body, params, or query.
  * `401 UNAUTHORIZED` — Missing, invalid, or expired Bearer JWT.
  * `403 PROFILE_INCOMPLETE` — Learner profile not yet completed (`BR-01`).
  * `404 RESOURCE_NOT_FOUND` — Session not found or not owned by the authenticated user (`NFR-005`).
  * `409 TIER_LOCKED` — Attempted to generate/submit a locked Practice tier (`BR-02`).
  * `422 EDUCATIONAL_GUARDRAIL_REFUSAL` — Non-educational or unsafe topic/prompt refused (`Edge Case 2`).
  * `429 DAILY_QUOTA_EXCEEDED` — Reached 50 AI actions/day (`BR-04`); include `{ resetAt }` in `details`.
  * `502 AI_UPSTREAM_FAILURE` — Gemini API failure, timeout, or invalid schema output after retry.
* **Structured Safe Logging:** Use **Pino** (`src/config/logger.ts`) with request context. Agents **MUST NOT** use `console.log` in backend application code and **MUST NEVER** log stack traces in production client responses, `passwordHash`, JWT strings, or `GEMINI_API_KEY`.

### Frontend Error & State Handling (`apps/client`)
* Every data-driven view **MUST** explicitly handle `loading`, `error`, `empty`, and `success` states.
* Provide clear skeleton/progress feedback during 6–12s Practice Mode 10-MCQ generation (`NFR-002`), inline retry controls on SSE stream drops (`Edge Case 4`), and a `try/catch` fallback inside `<MermaidDiagram />` so malformed diagram syntax never crashes the React tree (`Edge Case 3`).

---

## F. API and Backend Development Rules

* **Strict Layer Separation:** Enforce `Routes -> Middlewares -> Controllers -> Services -> Repositories / AI Layer`.
  * **Controllers** **MUST** remain thin: extract validated request data, call a single Service method, and return the standard JSON envelope (`{ success: true, data, meta }`) or manage SSE headers.
  * **Services** **MUST** contain all domain and pedagogical state machines (`ExplainEngine`, `InteractEngine`, `PracticeEngine`). Do not duplicate business logic across controllers.
  * **Repositories** **MUST** encapsulate all Mongoose database operations. Controllers and AI modules **MUST NOT** query Mongoose models directly.
* **Mandatory Middleware Pipeline:**
  * Apply `authMiddleware` $\rightarrow$ `profileCompletedMiddleware` (`BR-01`) $\rightarrow$ `quotaMiddleware` (only on AI-generating routes per `BR-04`) $\rightarrow$ `validateMiddleware(schema)` before controller execution.
* **Contract Preservation:** Preserve all `/api/v1/*` endpoint paths and envelopes defined in Section G of `architecture.md`. Any intentional contract modification **MUST** be coordinated simultaneously across `@mentora/shared`, `@mentora/server`, and `@mentora/client`.

---

## G. Frontend Development Rules

* **Unified Workspace & Mode Continuity (`FR-004`–`FR-006`):** Explain, Interact, and Practice modes **MUST** render inside the shared `WorkspacePage` bound to the active `TopicSession` in Redux (`sessionSlice`). Switching tabs in `ModeSwitcherTabs` **MUST** preserve session context without asking the user to re-enter the topic.
* **Shared Tutoring Contracts & Rendering (`FR-009`):** All three modes **MUST** consume the shared `TopicSessionDTO` contract and render rich content through the shared `<RichMarkdownRenderer />` (supporting GFM, KaTeX `$...$` / `$$...$$`, syntax-highlighted code blocks, and fault-tolerant `<MermaidDiagram />`). Agents **MUST NOT** build separate, incompatible markdown/math renderers per mode.
* **Presentation vs. State/API Separation:** UI components **MUST** have strictly typed props and focus on presentation. All REST calls **MUST** go through the centralized Axios client (`src/services/apiClient.ts` + Redux thunks), and SSE streams **MUST** use `useSseStream.ts`.
* **Mid-Quiz Draft Persistence (`Edge Case 5`):** Selecting an MCQ option in Practice Mode **MUST** immediately persist to `localStorage` (`mentora_quiz_draft_${sessionId}_${tier}`) via `useQuizDraftPersistence` and clear upon batch submission.
* **Accessibility & Responsiveness (`NFR-004`):** Use semantic HTML (`<nav>`, `<main>`, `<article>`, `<button>`), ensure full keyboard navigation (`Tab`, `Enter`, `Space`) for Explain card controls and MCQ radio options, and support both desktop (`1024px+`) and mobile/tablet (`360px–1023px`) viewports.

---

## H. AI Integration and Tutoring Rules

* **Isolated AI Provider Layer:** All `@google/genai` SDK calls, prompt builders, and `responseSchema` declarations **MUST** reside exclusively in `apps/server/src/ai/`. No controller, route, repository, or frontend module may import `@google/genai`.
* **Server-Side Credentials & Configurable Models:** `GEMINI_API_KEY`, `GEMINI_FAST_MODEL`, and `GEMINI_REASONING_MODEL` **MUST** remain strictly in server-side environment variables (`src/config/env.ts`) and **MUST NEVER** be exposed to the client or hardcoded in services.
* **Shared Pedagogical Prompt Builder:** All three modes **MUST** use the shared `PromptBuilder` (`apps/server/src/ai/prompts/`) to inject:
  1. Educational scope and safety guardrails (`FR-016` / `FR-018`, `Edge Case 2`).
  2. The user's **Static Learner Profile** (`educationLevel`, `preferredStyle`).
  3. Formatting constraints (LaTeX `$...$`/`$$...$$` and quoted Mermaid node labels).
* **Untrusted LLM Outputs & Runtime Validation:** Treat all Gemini outputs as untrusted until parsed and validated against `@mentora/shared` Zod schemas. If structured JSON validation fails, retry once before throwing `502 AI_UPSTREAM_FAILURE`.
* **Reasoning-First MCQ Schema (`FR-017`):** In Practice Mode generation schemas, `solutionExplanation` **MUST** always precede `correctOptionIndex` in property order so the model completes its step-by-step derivation before locking in the answer index.
* **Deterministic Evaluation Over LLM Grading:** Never use an LLM call to grade Practice Mode MCQ submissions. Batch scoring ($0\text{–}10$) and tier unlocking (`easy` $\rightarrow$ `medium` $\rightarrow$ `hard`) **MUST** be evaluated deterministically in `practice.service.ts` by comparing `userAnswers` against stored `correctOptionIndex` values.
* **Deterministic 3-Strike Socratic State Machine (`FR-012`):** In Interact Mode (`interact.service.ts`), parse and strip the `<<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"}>>` control header from the stream, deterministically compute `strikeCount` (`0`, `1`, `2`, or Circuit Breaker reset on Strike 3 / manual trigger), persist the completed turn to MongoDB, and emit the final `event: metadata` SSE frame. If a stream fails mid-flight, emit `event: error` and **MUST NOT** increment `strikeCount`.

---

## I. Database and Data Integrity

* **Approved Models (`architecture.md` Section F):** Persist data exclusively through the `User` and `TopicSession` Mongoose models defined in `apps/server/src/models/`. Agents **MUST NOT** invent new collections or split mode states into separate collections without architectural approval.
* **Multi-Tenant Ownership Isolation (`NFR-005`):** Every `TopicSession` read, update, or delete query in `repositories/` **MUST** filter by `{ _id: sessionId, userId: req.user.id }`.
* **Pre-Persistence Validation & Indexes:** Validate all data before writing to MongoDB. Preserve required indexes (`{ email: 1 }` unique on `User`; `{ userId: 1, updatedAt: -1 }` and `{ _id: 1, userId: 1 }` on `TopicSession`).
* **Practice Answer-Key Masking (`BR-03`):** While a `PracticeBatch.status` is `'in_progress'`, API responses **MUST** mask or omit `correctOptionIndex` and `solutionExplanation` so learners cannot inspect network payloads before submitting all 10 answers.

---

## J. Security and Configuration

* **Startup Environment Validation:** Both `apps/server` and `apps/client` **MUST** validate required environment variables at startup using Zod (`config/env.ts`) and fail fast if any required secret or URL is missing.
* **Secret Hygiene:** Agents **MUST NEVER** hardcode or commit `.env` files, `GEMINI_API_KEY`, `JWT_SECRET`, or `MONGODB_URI` to version control.
* **Authentication & Password Security:** Hash passwords using `bcryptjs` (cost factor `12`), exclude `passwordHash` (`select: false`) from default queries, and authenticate cross-origin requests via `Authorization: Bearer <jwt>` (`HS256`).
* **Input Bounds & Abuse Prevention:** Enforce character limits (`300` chars for `topicQuery`, `2,000` chars for Interact messages), apply `helmet()`, restrict `cors()` to `env.CLIENT_ORIGIN`, and enforce both IP rate limiting (`express-rate-limit`) and the persistent 50/day per-user AI quota (`quota.middleware.ts`).
* **No Security Bypass:** Agents **MUST NEVER** weaken authentication, ownership checks, or quota middlewares to make a test pass.

---

## K. Testing and Quality Assurance

* **Required Test Coverage:**
  * **Unit Tests (`Vitest`):** Shared Zod schemas (`@mentora/shared`), 3-Strike Socratic state transitions (`interact.service.ts`), Practice tier unlocking, answer masking, and $O(1)$ batch grading (`practice.service.ts`), and rolling 24h quota enforcement (`quota.middleware.ts`).
  * **Integration Tests (`Supertest` + `mongodb-memory-server`):** Auth flows, `OnboardingGuard` / `PROFILE_INCOMPLETE` (`BR-01`) enforcement, cross-user session isolation (`404` on foreign session ID), and REST/SSE error envelopes.
  * **Frontend Tests (`Vitest` + `React Testing Library`):** Progressive Explain card navigation (`Next` / `Go Deeper`), `<MermaidDiagram />` fallback on syntax errors (`Edge Case 3`), and `localStorage` quiz draft persistence (`Edge Case 5`).
* **Deterministic CI vs. Live AI Evaluation:** Standard test runs **MUST** mock `@google/genai` so tests execute deterministically offline. Live Gemini API accuracy checks belong exclusively in the standalone `eval:ai` script.
* **Agent Verification Protocol:**
  1. Inspect `package.json` scripts across workspaces before running commands; never invent nonexistent scripts.
  2. Add or update unit/integration tests whenever adding features or fixing bugs.
  3. Run available type-checking (`typecheck`), linting (`lint`), and test (`test`) scripts before completing a task.
  4. Explicitly report which checks passed, failed, or could not be executed. **NEVER** claim a test passed without actually executing it.

---

## L. Git and Change Management

* **Inspect Before Editing:** Always inspect existing files, imports, and tests before modifying code.
* **Minimal, Focused Diffs:** Make small, cohesive, reviewable changes that directly address the task. Avoid unrelated refactoring, reformatting untouched files, or renaming established exports.
* **Preserve Existing Behavior:** Do not overwrite user changes, delete files, or alter working functionality unless explicitly required.
* **Clean Repository Hygiene:** Never stage or commit `node_modules/`, `dist/`, `build/`, `.env`, coverage reports, or log files.
* **No Unauthorized Git Mutations:** Agents **MUST NOT** run `git commit`, `git push`, `git reset --hard`, or other destructive Git operations unless explicitly instructed by the user.

---

## M. Deployment and Environment Compatibility

* **Split-Origin Cloud Topology (`Vercel` + `Render` + `MongoDB Atlas`):**
  * **Stateless Backend (`Render`):** `apps/server` **MUST** remain completely stateless. Never rely on local filesystem storage or in-memory session state across requests; persist all state in MongoDB Atlas.
  * **Unbuffered SSE Streaming:** `POST /api/v1/sessions/:id/interact/stream` **MUST** send `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`, plus a 15-second `: keepalive\n\n` heartbeat comment so Render's proxy never buffers or drops the stream.
  * **Cold-Start Mitigation & Health Check:** Maintain `GET /api/v1/health` on the backend and trigger a non-blocking background fetch from the frontend on initial app load to wake sleeping Render instances.
  * **Vercel SPA Routing & Build Order:** Build `@mentora/shared` before `@mentora/server` and `@mentora/client`, and configure `vercel.json` SPA rewrites (`/* -> /index.html`).

---

## N. Rules for Making Changes

For every coding task, agents **MUST** execute the following 7-step workflow:

1. **Read Specs:** Review the relevant sections of `requirement.md` (`product_requirement.md`), `architecture.md`, and `AGENTS.md`.
2. **Inspect Codebase:** Check existing workspace files, `@mentora/shared` contracts, and `package.json` dependencies.
3. **Scope Minimal Change:** Identify the smallest complete set of changes across `@mentora/shared`, `@mentora/server`, and/or `@mentora/client` required to satisfy the request.
4. **Follow Patterns:** Adhere strictly to layered service boundaries, shared Zod schemas, and unified UI rendering patterns.
5. **Sync Contracts & Tests:** Update shared schemas/types, dependent modules, unit/integration tests, and documentation together.
6. **Verify Quality:** Run available typecheck, lint, and test commands and inspect their actual output.
7. **Summarize Clearly:** Report what changed, which verification checks ran and passed, any low-risk assumptions documented, and any follow-up work remaining. Ask for clarification only when an ambiguity materially impacts correctness, security, product behavior, or architectural compatibility.