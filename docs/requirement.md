# Product Requirements Document (PRD): Mentora

**Document Version:** 1.0.0 (MVP Baseline)  
**Product Name:** Mentora  
**Document Status:** Approved for Product Design & Development  
**Target Release:** v1.0 MVP  

---

## 1. Product Overview & Vision

### 1.1 Product Vision
**Mentora** is an AI-powered tutoring web application that helps learners understand concepts, develop skills, and assess their knowledge across any discipline or educational level. By combining structured pedagogical scaffolding with interactive Socratic dialogue and tiered retrieval practice, Mentora provides a complete learning loop for any topic brought by the user.

### 1.2 First-Principles Pedagogical Foundation
Learning fails when information is presented as an unchunked wall of text, when conversational AI tutors trap learners in endless questioning loops without forward progress, or when assessments lack structured difficulty progression. Mentora solves these three failure modes directly through three core modes:
1. **Explain Mode (Knowledge Encoding):** Breaks complex topics into progressive, digestible cards (*Intuition $\rightarrow$ Core Mechanism $\rightarrow$ Example $\rightarrow$ Check-for-Understanding*), enriched with rich formatting (mathematical notation, code blocks, and visual diagrams), with user-controlled depth (`Next` / `Go Deeper`).
2. **Interact Mode (Guided Socratic Discovery):** Guides learners across explicit conceptual milestones using adaptive Socratic dialogue, safeguarded by a deterministic struggle handler (the **3-Strike Socratic Circuit Breaker**) that guarantees the learner never hits a frustrating dead end.
3. **Practice Mode (Tiered Retrieval & Assessment):** Evaluates mastery via structured 10-question Multiple-Choice Question (MCQ) batches across progressive difficulty tiers (**Easy $\rightarrow$ Medium $\rightarrow$ Hard**), followed by a comprehensive review comparing user choices against correct answers and step-by-step rationales.

---

## 2. Problem Statement & Proposed Solution

### 2.1 Problem Statement
* **Passive Information Overload:** General-purpose AI chat interfaces output long, monolithic walls of text that overwhelm working memory and encourage passive reading rather than active comprehension.
* **Unbounded Socratic Frustration:** Naive conversational tutors repeatedly ask stuck learners variations of the same question without offering structured hints or direct explanations when fundamental knowledge gaps occur.
* **Unstructured & Unreliable Self-Testing:** Learners struggle to gauge true mastery across foundational, intermediate, and advanced concepts without structured assessment tiers and verified, step-by-step answer rationales.
* **Fragmented Study Workflows:** Students must constantly re-explain their background, education level, and preferred learning style across every new study session.

### 2.2 Proposed Solution
A unified single-page learning workspace where a learner defines a persistent **Static Learner Profile** once, enters any topic, and seamlessly switches across **Explain**, **Interact**, and **Practice** modes bound to that exact topic session—with past topic sessions saved in an accessible history sidebar.

---

## 3. Target Users, Personas, & User Needs

### 3.1 Target Audience Scope
* **Confirmed Product Scope:** Mentora is designed to support learners studying **any topic** across technical, quantitative, scientific, or humanities domains.
* **Baseline UX & Legal Target (PM Recommendation):** While any learner can study any topic, the baseline user experience, account management, and privacy compliance target **Independent Learners (Ages 13+)**—spanning high school students, university undergraduates, and working professionals. This ensures streamlined onboarding and workspace navigation while accommodating varied comprehension levels via the Static Learner Profile.

### 3.2 Core User Personas
| Persona | Profile Settings | Primary Need | Key Mentora Workflow |
| :--- | :--- | :--- | :--- |
| **1. The University STEM Student** | **Level:** Undergraduate<br>**Style:** Concise & Technical | Needs rigorous intuition, mathematical derivations, complexity analysis, and exam-grade MCQ practice on quantitative or technical subjects. | Starts in **Explain Mode** (`Go Deeper` for technical derivations) $\rightarrow$ tests edge cases in **Practice Mode** (Easy to Hard MCQ batches). |
| **2. The High School Exam Prepper** | **Level:** High School<br>**Style:** Analogy-Heavy | Needs relatable real-world analogies and guided Socratic breakdowns without intimidating academic jargon. | Starts in **Explain Mode** $\rightarrow$ switches to **Interact Mode** to work through misconceptions via guided milestones. |
| **3. The Upskilling Professional** | **Level:** Professional<br>**Style:** Visual | Wants fast, structured conceptual models and visual flowcharts to grasp new domains rapidly. | Uses **Explain Mode** with visual diagrams $\rightarrow$ verifies retention in **Practice Mode**. |

---

## 4. Product Goals, Non-Goals, & Success Metrics

### 4.1 Product Goals
1. **Low Time-to-Value (TTV):** Allow users to enter any topic and immediately engage with their chosen learning mode without mandatory multi-step course or syllabus generation.
2. **Cognitive Load Optimization:** Deliver structured explanations in progressive chunks enriched with equations, code, and diagrams rather than unstructured text blocks.
3. **Frustration-Free Socratic Tutoring:** Ensure every interactive tutoring session has visible conceptual milestones and a deterministic escape hatch when a learner gets stuck.
4. **High-Trust Mastery Verification:** Provide 30 structured MCQs per topic across three difficulty tiers (10 Easy, 10 Medium, 10 Hard) with verified answer keys and transparent explanations.
5. **Sustainable Cost & Usage Control:** Provide a free MVP experience protected by fair daily per-user usage limits.

### 4.2 Explicit Non-Goals (Out of Scope for v1.0 MVP)
* **No Document or File Uploads:** Uploading PDF, PNG, JPG, or Markdown files is excluded from v1.0 and deferred to future releases.
* **No Default Syllabus / Roadmap Generation:** Mentora launches directly into the selected mode for a topic unless roadmap features are introduced in a post-MVP update.
* **No Per-Session Difficulty Toggles in Explain Mode:** Explanation tone and baseline depth are governed automatically by the user's Static Learner Profile and expanded via the `Go Deeper` action.
* **No Real-Time Voice or Audio Interaction:** All interactions in v1.0 are text- and rich-media-based.
* **No Free-Text or Live Code Execution Exercises in Practice Mode:** v1.0 Practice Mode is strictly scoped to Multiple-Choice Questions (MCQs).
* **No Dynamic Cross-Session Misconception Dashboards:** Long-term weakness aggregation and mastery analytics dashboards are deferred to post-MVP phases.
* **No Third-Party Social Login or Paid Subscriptions:** v1.0 uses standard email/password authentication and is free to use within daily usage quotas.

### 4.3 Product & Learning Success Metrics (KPIs)
| Metric Category | Metric Name | Target Threshold (MVP) | Measurement Definition |
| :--- | :--- | :--- | :--- |
| **Learning Effectiveness** | **Explain Mode Completion Rate** | $\ge 65\%$ | Percentage of Explain sessions where the learner advances through all 4 core cards to reach *Check-for-Understanding*. |
| **Learning Effectiveness** | **Practice Tier Progression Rate** | $\ge 50\%$ | Percentage of Practice sessions where a learner completes the Easy batch (10 MCQs) and initiates the Medium batch. |
| **Engagement** | **Cross-Mode Adoption Rate** | $\ge 40\%$ | Percentage of topic sessions where the learner engages with at least 2 of the 3 modes (`Explain`, `Interact`, `Practice`). |
| **Retention** | **7-Day Learner Return Rate** | $\ge 25\%$ | Percentage of onboarded users who return to create or resume a topic session within 7 days of signup. |
| **Quality & Trust** | **Assessment Accuracy & Validity Rate** | $\ge 99.0\%$ | Percentage of generated Practice MCQ batches that contain 10 complete questions with a verified, logically consistent correct option and rationale. |

---

## 5. User Journeys & High-Level Workflows

### 5.1 Journey 1: First-Time Onboarding & Profile Setup
1. **Registration:** A new learner visits Mentora and creates an account using their name, email address, and password.
2. **Profile Setup:** Before entering the workspace, the learner is prompted with a concise 2-step **Static Learner Profile** setup:
   * **Step 1 — Education / Experience Level:** Selects *High School*, *Undergraduate*, or *Professional*.
   * **Step 2 — Preferred Explanation Style:** Selects *Visual*, *Analogy-Heavy*, or *Concise & Technical*.
3. **Workspace Entry:** The learner is taken directly to the main learning workspace, ready to enter their first topic.

### 5.2 Journey 2: End-to-End Topic Mastery Across Modes
1. **Topic Input & Mode Selection:** The learner types *"Deadlocks in Operating Systems"* into the topic prompt bar and selects **Explain Mode**.
2. **Progressive Explanation:** Mentora displays **Card 1 (Intuition)**. The learner reads the analogy, clicks **`Next`** to read **Card 2 (Core Mechanism)**, and clicks **`Go Deeper`** on Card 2 to inspect an expanded breakdown with a visual flowchart of resource allocation. The learner then progresses through **Card 3 (Example)** and **Card 4 (Check-for-Understanding)**.
3. **Seamless Switch to Interact Mode:** Wanting to test their conceptual intuition conversationally, the learner clicks the **`Interact`** tab in the top navigation bar. Mentora retains the active topic (*"Deadlocks in Operating Systems"*), displays a 4-milestone progress tracker, and asks an opening diagnostic question.
4. **Guided Discovery & Struggle Recovery:** The learner answers Milestone 1 correctly and advances to Milestone 2. On Milestone 2, the learner gets confused and gives two incorrect responses (`Strike 1` nudge $\rightarrow$ `Strike 2` concrete hint). On the third unsuccessful attempt (`Strike 3`), Mentora automatically triggers the circuit breaker—providing a clear, direct explanation of the concept before checking understanding and moving to Milestone 3.
5. **Seamless Switch to Practice Mode:** Ready for formal self-testing, the learner clicks the **`Practice`** tab. Mentora presents the **Easy Batch (10 MCQs)**.
6. **Batch Evaluation & Tier Progression:** After answering all 10 Easy questions and submitting the batch, the learner views their score ($8/10$) alongside a full review comparing their selected option against the correct option and step-by-step explanation for every question. The learner then clicks **`"Start Medium Batch (10 Questions)"`** to continue up the difficulty ladder.

### 5.3 Journey 3: Resuming a Saved Session
1. **Session History Navigation:** A returning learner logs in and views their past study topics in the **Left Sidebar**.
2. **Instant State Restoration:** Clicking a previous topic session immediately restores the saved Explain cards, Interact conversation transcript and milestone state, and Practice Mode quiz results across all three mode tabs.

---

## 6. Functional Requirements Catalog

Requirements are prioritized using the MoSCoW framework (**Must Have**, **Should Have**, **Could Have**, **Won't Have** for v1.0 MVP).

| Req ID | Feature Area | Priority | Requirement Description |
| :--- | :--- | :--- | :--- |
| **FR-001** | Authentication | **Must Have** | The system must allow users to register, log in, and log out using an email address and password. |
| **FR-002** | Onboarding | **Must Have** | First-time authenticated users must complete a mandatory 2-question **Static Learner Profile** (*Education/Experience Level* and *Preferred Explanation Style*) before starting a topic session. |
| **FR-003** | Profile Management | **Should Have** | Authenticated users must be able to view and modify their Static Learner Profile settings at any time, with changes taking effect on all subsequent tutor interactions. |
| **FR-004** | Topic Initiation | **Must Have** | Users must be able to input any free-text learning topic and select an initial mode (`Explain`, `Interact`, or `Practice`) to start a study session immediately. |
| **FR-005** | Mode Switching | **Must Have** | The workspace must provide a persistent top **Mode Switcher** (`Explain` \| `Interact` \| `Practice`) bound to the active topic session, allowing users to switch modes without re-entering the topic or losing progress in other modes. |
| **FR-006** | Session History | **Must Have** | The workspace must display a collapsible **Left Sidebar** listing all saved topic sessions in reverse chronological order, allowing users to reopen or delete any past session. |
| **FR-007** | Explain Mode | **Must Have** | Explain Mode must break down any valid topic into a progressive 4-card sequence: **1. Intuition**, **2. Core Mechanism**, **3. Example**, and **4. Check-for-Understanding**. |
| **FR-008** | Explain Mode | **Must Have** | Each Explain card must provide two progression controls: **`Next`** (to advance to the next sequential card) and **`Go Deeper`** (to generate an expanded sub-card exploring deeper technical details, derivations, or examples for the current step). |
| **FR-009** | Rich Content Rendering | **Must Have** | All learning modes must natively render formatted text, **LaTeX mathematical notation** ($inline$ and $$display$$), **syntax-highlighted code blocks**, and **visual diagrams/flowcharts**. |
| **FR-010** | Interact Mode | **Must Have** | Interact Mode must structure every session around a **Goal-Oriented Diagnostic Flow** consisting of **3 to 5 explicit conceptual milestones** displayed in a visible progress indicator, beginning with an initial diagnostic question. |
| **FR-011** | Interact Mode | **Must Have** | Interact Mode must deliver tutor responses with real-time progressive text streaming and support rich text/code/math formatting in both user inputs and tutor replies. |
| **FR-012** | Interact Mode | **Must Have** | Interact Mode must enforce a **3-Strike Socratic Circuit Breaker** per milestone: providing a Socratic nudge on Strike 1, a concrete hint/analogy on Strike 2, and a direct explanation + comprehension check on Strike 3. |
| **FR-013** | Interact Mode | **Should Have** | Interact Mode should provide a manual **"Explain this milestone directly"** control allowing a learner to bypass questioning on the current milestone if desired. |
| **FR-014** | Practice Mode | **Must Have** | Practice Mode must evaluate learners exclusively through **Multiple-Choice Questions (MCQs)** delivered in sequential batches of **10 questions per difficulty tier**: **Easy (10 MCQs)** $\rightarrow$ **Medium (10 MCQs)** $\rightarrow$ **Hard (10 MCQs)**. |
| **FR-015** | Practice Mode | **Must Have** | Each MCQ must display a clear question stem, 4 distinct answer choices (`A`, `B`, `C`, `D`), and an optional on-demand **Hint** prior to batch submission. |
| **FR-016** | Practice Mode | **Must Have** | Upon completing and submitting a 10-question batch, Practice Mode must display the batch score ($X/10$), reveal a question-by-question review showing the **User's Selected Option**, the **Correct Option**, and a **Step-by-Step Explanation**, and unlock the next difficulty tier. |
| **FR-017** | Practice Mode | **Must Have** | Practice Mode must ensure every generated MCQ undergoes step-by-step derivation prior to answer key selection so that the marked correct option strictly matches the written explanation. |
| **FR-018** | Guardrails & Quotas | **Must Have** | The system must enforce a daily per-user interaction quota and politely refuse non-educational, harmful, or off-topic requests. |
| **FR-019** | Deferred Features | **Won't Have** | Document uploads (PDF/PNG/JPG/MD), default syllabus generation, voice chat, coding execution sandboxes, and cross-session misconception dashboards are excluded from v1.0. |

---

## 7. Detailed Product Behavior by Learning Mode

### 7.1 Explain Mode Specification
* **Pedagogical Purpose:** Structured knowledge encoding with minimal cognitive overload.
* **4-Step Card Sequence:**
  1. **Step 1 — Intuition:** Establishes the high-level mental model, explains *why* the topic exists or matters, and provides an intuitive analogy aligned with the user's Static Learner Profile.
  2. **Step 2 — Core Mechanism:** Explains the formal rules, underlying theory, mathematical formulas, or system architecture (incorporating visual diagrams and equations where appropriate).
  3. **Step 3 — Example:** Walks through a concrete, step-by-step applied problem, real-world scenario, or annotated code demonstration.
  4. **Step 4 — Check-for-Understanding (CFU):** Presents a targeted reflection question with an expandable answer reveal so the learner can self-verify comprehension before transitioning to Interact or Practice mode.
* **User Controls & Pacing:**
  * **Progressive Disclosure:** Only steps up to the learner's current progress point are shown; future cards remain collapsed or hidden until the learner clicks **`Next`**.
  * **On-Demand Depth (`Go Deeper`):** Clicking **`Go Deeper`** on any card generates a nested sub-card immediately below the parent card, offering deeper derivations, edge cases, or visual diagrams without losing the user's place in the main 4-step sequence.
  * **No Manual Difficulty Toggles:** To keep the interface clean and distraction-free, Explain Mode does not display manual difficulty sliders; baseline complexity is automatically calibrated by the learner's profile.

### 7.2 Interact Mode Specification
* **Pedagogical Purpose:** Active conceptual discovery, reasoning verbalization, and misconception resolution.
* **Goal-Oriented Diagnostic Flow:**
  * **Milestone Mapping:** Upon initiating Interact Mode for a topic, Mentora decomposes the topic into **3 to 5 sequential conceptual milestones** and displays them in a persistent header above the conversation (showing `Pending`, `Active`, or `Completed` states).
  * **Diagnostic Opening:** The tutor opens the conversation by asking the learner what they already know about the topic or posing a foundational diagnostic question anchored to Milestone 1.
  * **Milestone Advancement:** When the learner's response demonstrates mastery of the active milestone, the tutor affirms the insight, marks the milestone as `Completed`, and transitions the dialogue to the next milestone until all milestones are completed.
* **The 3-Strike Socratic Circuit Breaker:**
  * When a learner responds with an incorrect answer, a partial misconception, or *"I don't know"* on the active milestone, Mentora tracks consecutive unsuccessful attempts (`Strikes`):
    * **Strike 1 (Socratic Nudge):** The tutor acknowledges what is right (if anything) and asks a simpler, targeted guiding question that points the learner toward the missing insight.
    * **Strike 2 (Concrete Hint / Analogy):** If the learner struggles a second consecutive time, the tutor stops asking open-ended questions and provides a concrete hint, analogy, or narrowed two-choice prompt.
    * **Strike 3 (Circuit Breaker — Direct Explanation):** If the learner struggles a third consecutive time, the tutor halts Socratic withholding, provides a clear, direct micro-explanation of the milestone concept, and asks a simple confirmation question to ensure clarity before resetting the strike counter and advancing.

### 7.3 Practice Mode Specification
* **Pedagogical Purpose:** Active retrieval practice and mastery verification across structured difficulty tiers.
* **Tiered 10-MCQ Batch Progression:**
  * Practice Mode organizes assessment into three sequential difficulty tiers, each containing exactly **10 Multiple-Choice Questions**:
    1. **Tier 1: Easy Batch (10 MCQs):** Tests foundational definitions, core concepts, and direct recall.
    2. **Tier 2: Medium Batch (10 MCQs):** Tests multi-step application, scenario analysis, and analytical problem-solving.
    3. **Tier 3: Hard Batch (10 MCQs):** Tests complex edge cases, synthesis of multiple concepts, and rigorous quantitative/technical reasoning.
* **Quiz-Taking Experience:**
  * When entering Practice Mode, the **Easy Batch (10 MCQs)** is presented first.
  * For each question (`1` through `10`), the learner sees the question stem (supporting equations, code snippets, or tables), four options (`A`, `B`, `C`, `D`), and an optional **`Show Hint`** button.
  * Correct answers and rationales remain hidden while the batch is in progress.
  * Unsubmitted answer selections are preserved if the learner switches tabs or refreshes the page mid-batch.
* **Batch Submission & Review Screen:**
  * Once the learner answers all 10 questions and submits the batch, Mentora immediately calculates the batch score (e.g., `8 / 10 — 80%`) and transitions the batch into **Review Mode**.
  * In **Review Mode**, each of the 10 questions clearly displays:
    * **Your Choice:** The option selected by the learner (highlighted in green if correct, red if incorrect).
    * **Correct Option:** The verified correct option (`A`, `B`, `C`, or `D`) highlighted in green.
    * **Explanation:** A comprehensive step-by-step rationale explaining why the correct answer is right and why the other options are incorrect.
  * Completing the Easy Batch unlocks the **`"Start Medium Batch (10 Questions)"`** action; completing the Medium Batch unlocks the **`"Start Hard Batch (10 Questions)"`** action.
  * Completing all three tiers displays an overall **Topic Practice Summary** ($X/30$ total score across Easy, Medium, and Hard).

---

## 8. Personalization, Learner Memory, & Progress Tracking

### 8.1 Static Learner Profile Specification
For v1.0 MVP, personalization is driven deterministically by the learner's **Static Learner Profile**, which persists across all sessions and governs how all three modes communicate:

| Profile Attribute | Selectable Options | Expected Product Adaptation |
| :--- | :--- | :--- |
| **Education / Experience Level** | • **High School**<br>• **Undergraduate**<br>• **Professional** | Calibrates vocabulary complexity, assumed prerequisite knowledge, mathematical rigor, and the real-world context of examples and MCQ distractors. |
| **Preferred Explanation Style** | • **Visual**<br>• **Analogy-Heavy**<br>• **Concise & Technical** | • **Visual:** Prioritizes structured diagrams, flowcharts, and comparative tables.<br>• **Analogy-Heavy:** Leads with relatable real-world metaphors before introducing formal jargon.<br>• **Concise & Technical:** Eliminates conversational filler, focusing on formal definitions, equations, code, and edge cases. |

### 8.2 Session Persistence vs. Deferred Memory Features
* **Included in v1.0 MVP:** Full persistence of all user-created topic sessions (Explain cards and deep-dives generated, Interact chat history and milestone completion status, and Practice Mode batch scores and review states) accessible via the Left Sidebar.
* **Deferred to Post-MVP (v2.0):** Automated cross-session misconception tracking, aggregated topic mastery dashboards, and automated spaced-repetition revision scheduling.

---

## 9. User Experience (UX) & Interface Expectations

### 9.1 Core Layout & Navigation Architecture
1. **Authentication & Onboarding Views:** Clean, distraction-free screens for registration, login, and the 2-step Static Learner Profile selection.
2. **Unified Single-Page Workspace:**
   * **Left Collapsible History Sidebar:** Displays a `"+ New Topic"` button at the top, a scrollable list of past topic sessions, a daily usage quota indicator, and a profile settings trigger at the bottom.
   * **Sticky Topic & Mode Header:** Displays the active topic title alongside the prominent 3-tab Mode Switcher (`Explain` | `Interact` | `Practice`).
   * **Main Interactive Stage:** Dynamically renders the active mode's interface while preserving scroll position and state when toggling between modes.
3. **Responsive Design:** The workspace must support desktop, tablet, and mobile viewports (collapsing the Left Sidebar into a slide-out drawer on smaller screens).

---

## 10. Business Rules, Edge Cases, & Error Handling

### 10.1 Core Business Rules
* **BR-01 (Mandatory Onboarding):** A user cannot initiate a topic session until their Static Learner Profile (`Education Level` and `Preferred Explanation Style`) is saved.
* **BR-02 (Sequential Practice Tier Unlocking):** Within any topic session, Practice Mode always starts with the **Easy (10 MCQs)** batch. The **Medium (10 MCQs)** batch unlocks only after the Easy batch is submitted, and the **Hard (10 MCQs)** batch unlocks only after the Medium batch is submitted.
* **BR-03 (Batch Completion Before Reveal):** Users must select an option for all 10 questions in the active Practice batch and submit the batch before correct options and explanations are revealed.
* **BR-04 (Per-User Daily Usage Quota):** Mentora is free to use in v1.0, subject to a daily per-user AI generation quota. When a user reaches their daily limit, they can still browse all previously generated sessions, cards, chat transcripts, and quiz reviews, and are shown a clear message indicating when their daily quota resets.

### 10.2 Edge Cases & User-Facing Error Handling
| Scenario / Edge Case | Expected User-Facing Behavior |
| :--- | :--- |
| **1. Non-Educational or Unsafe Topic Input** | If a user enters a harmful, unethical, or non-educational prompt (e.g., asking to generate spam or unsafe content), Mentora displays a polite refusal notice explaining that Mentora is dedicated to educational learning and prompts the user to enter a valid study topic. |
| **2. Overly Broad Topic Input** (e.g., *"Science"* or *"Coding"*) | Mentora accepts the input, scopes Explain Mode to a foundational overview of the field's core pillars, and suggests specific sub-topics in the final card if the learner wants to drill down further. |
| **3. Diagram Rendering Failure** | If an AI-generated diagram contains syntax that cannot be rendered visually, the interface gracefully falls back to a clean text/code representation without breaking the surrounding card or page layout. |
| **4. Network Interruption During Interact Mode Streaming** | If the user's connection drops mid-response, the interface displays a clear *"Connection interrupted — Retry"* action on the incomplete message without penalizing the learner's strike count. |
| **5. Accidental Page Refresh During a 10-MCQ Batch** | Any options already selected by the learner in an unsubmitted 10-MCQ batch are preserved locally so the learner can continue from the exact question they left off on. |

---

## 11. Non-Functional Requirements (NFRs)

| NFR ID | Category | Requirement Description |
| :--- | :--- | :--- |
| **NFR-001** | **Perceived Latency & Responsiveness** | Interactive conversational turns in Interact Mode must begin streaming visible text to the learner within **2.0 seconds (P90)** of message submission. |
| **NFR-002** | **Batch Generation Feedback** | When generating a 4-card Explain sequence or a 10-question Practice MCQ batch (which may take several seconds to verify), the UI must display clear progressive loading feedback so the user knows the system is actively working. |
| **NFR-003** | **Assessment Reliability** | 100% of Practice Mode MCQ batches rendered to the user must contain exactly 10 questions, 4 options per question, a valid answer index, and a step-by-step explanation that logically precedes and matches the answer key. |
| **NFR-004** | **Accessibility & Readability** | All views must maintain WCAG 2.1 AA color contrast ratios, support keyboard navigation for MCQ option selection and card advancement, and render mathematical equations clearly at scalable font sizes. |
| **NFR-005** | **Privacy & Account Security** | User passwords must be securely hashed, sessions must be authenticated, and a learner's saved topic sessions and profile settings must be strictly isolated from other users. |

---

## 12. Testable Acceptance Criteria for Core Features

### 12.1 Explain Mode Acceptance Criteria (FR-007, FR-008, FR-009)
* **AC-EXP-01:** Given an authenticated user who enters a valid topic and selects Explain Mode, when the session loads, then the user sees **Step 1: Intuition** first, calibrated to their Static Learner Profile.
* **AC-EXP-02:** Given the user is viewing Step $N$ (where $N < 4$), when the user clicks **`Next`**, then Step $N+1$ is displayed sequentially up to **Step 4: Check-for-Understanding**.
* **AC-EXP-03:** Given the user is viewing any Explain card, when the user clicks **`Go Deeper`**, then an expanded sub-card with deeper technical detail, examples, or diagrams is appended beneath the current card without resetting the 4-step sequence.

### 12.2 Interact Mode Acceptance Criteria (FR-010, FR-011, FR-012)
* **AC-INT-01:** Given a user opens Interact Mode for a topic, when the session initializes, then the UI displays 3 to 5 conceptual milestones in a progress tracker (with Milestone 1 marked active) and presents an opening diagnostic question.
* **AC-INT-02:** Given an active milestone with 0 strikes, when the user submits 3 consecutive incorrect or *"I don't know"* responses, then:
  * Response 1 provides a Socratic guiding question (`Strike 1`).
  * Response 2 provides a concrete hint or analogy (`Strike 2`).
  * Response 3 triggers the circuit breaker (`Strike 3`), providing a direct explanation of the milestone concept and a confirmation prompt before resetting the strike counter.
* **AC-INT-03:** Given the user demonstrates understanding of the active milestone, when the tutor evaluates the turn, then the current milestone is marked `Completed` and the next milestone becomes `Active`.

### 12.3 Practice Mode Acceptance Criteria (FR-014, FR-015, FR-016, FR-017)
* **AC-PRC-01:** Given a user enters Practice Mode for a topic, when the mode loads, then the **Easy Batch (10 MCQs)** is presented first, while **Medium** and **Hard** batches remain locked until their prerequisite tier is completed.
* **AC-PRC-02:** Given an active 10-MCQ batch, when the user selects options for all 10 questions and clicks **`Submit Batch`**, then the system displays the score out of 10 and reveals the **Batch Review** showing the user's selected option, the correct option, and the step-by-step explanation for all 10 questions.
* **AC-PRC-03:** Given the user has submitted the Easy (10 MCQs) batch, when viewing the Batch Review screen, then the **`Start Medium Batch (10 Questions)`** button is unlocked and clickable (and similarly from Medium to Hard).

---

## 13. MVP Release Phasing

### Phase 1: Core Workspace, Onboarding, & Explain Mode
* User registration, login, and mandatory 2-question Static Learner Profile onboarding.
* Unified Single-Page Workspace shell with Left Sidebar session history and Top Mode Switcher tabs.
* **Explain Mode** complete workflow: 4 progressive cards (*Intuition $\rightarrow$ Core Mechanism $\rightarrow$ Example $\rightarrow$ Check-for-Understanding*), `Next` and `Go Deeper` actions, and rich Markdown/LaTeX/Code/Diagram rendering.

### Phase 2: Interact Mode & Practice Mode
* **Interact Mode** complete workflow: 3–5 conceptual milestone tracker, opening diagnostic prompt, real-time streaming conversation, and the **3-Strike Socratic Circuit Breaker**.
* **Practice Mode** complete workflow: Tiered 10-MCQ batch generation (**10 Easy $\rightarrow$ 10 Medium $\rightarrow$ 10 Hard**), on-demand hints, batch score evaluation, side-by-side choice vs. correct answer review screen, and verified step-by-step rationales.

### Phase 3: Quota Safeguards, Polish, & Launch Readiness
* Daily per-user usage limit enforcement and educational scope guardrails.
* Mid-quiz local state persistence, network retry recovery, and responsive mobile/tablet refinements.

---

## 14. Risks, Assumptions, & Open Decisions

### 14.1 Product Risks & Mitigation Strategies
| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **1. Learner Impatience During 10-MCQ Batch Generation** | Generating 10 rigorous questions with verified step-by-step explanations at once takes several seconds, which could cause perceived lag. | Provide an informative progress indicator while generating a batch, and persist generated batches so switching between tabs (`Explain` $\leftrightarrow$ `Practice`) is instantaneous. |
| **2. Low Score Frustration on Easy/Medium Tiers** | If a learner scores poorly on the Easy batch and is blocked from progressing or retrying, they may abandon the session. | **PM Recommendation:** Always unlock the next difficulty tier upon completing and reviewing the current 10-question batch regardless of score, while also offering a `"Retry Tier"` option. |
| **3. Overly Broad User Prompts** | Users typing single-word broad subjects (e.g., *"Physics"*) may receive high-level overviews when they needed a specific chapter. | Include suggested sub-topic chips in Card 4 of Explain Mode so learners can launch a focused follow-up session with one click. |

### 14.2 Confirmed Decisions vs. PM Recommendations & Assumptions
* **Confirmed Decisions (Locked from Discovery):**
  * Open-ended universal topic support across three modes (`Explain`, `Interact`, `Practice`).
  * No document upload (PDF/PNG/JPG/MD) and no automatic syllabus/roadmap generation in v1.0.
  * Explain Mode uses 4 progressive cards with `Next` and `Go Deeper` controls, rich media rendering, and no manual difficulty toggles.
  * Interact Mode uses a 3–5 milestone diagnostic flow with a 3-Strike Socratic Circuit Breaker (text + rich input only).
  * Practice Mode uses 10-MCQ batches across Easy, Medium, and Hard tiers with post-batch answer comparison and verified explanations.
  * Personalization uses a 2-field Static Learner Profile (`Education Level` + `Preferred Explanation Style`), combined with a Unified Workspace and Left History Sidebar.
  * Free MVP access governed by daily per-user usage quotas.
* **PM Assumptions & Recommendations (Subject to Review):**
  * **Baseline Age Target:** Targeting independent learners aged 13+ for standard account self-onboarding.
  * **Tier Progression Rule:** Allowing users to proceed from Easy $\rightarrow$ Medium $\rightarrow$ Hard after submitting and reviewing all 10 questions in a batch without enforcing a punitive minimum passing score gate, maximizing learner agency.
  * **Daily Quota Threshold:** Setting the default free daily allowance to **50 tutor actions per user per day**, sufficient for multiple complete study sessions across all three modes.