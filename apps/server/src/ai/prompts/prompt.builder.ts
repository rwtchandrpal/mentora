import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  type StaticLearnerProfile,
} from '@mentora/shared';

export interface ExplainDeeperPromptParams {
  topicQuery: string;
  parentCard: {
    stepType: string;
    title: string;
    contentMarkdown: string;
    depthLevel?: number;
  };
}

export interface InteractTurnPromptParams {
  topicQuery?: string;
  activeMilestone?: string;
  milestones?: Array<{
    milestoneNumber: number;
    title: string;
    description: string;
    status?: string;
  }>;
  activeMilestoneIndex?: number;
  strikeCount: number;
  history: Array<{ role: string; content: string }>;
  userMessage: string;
  isManualBypass?: boolean;
  forceDirectExplanation?: boolean;
}

export interface PracticeGeneratePromptParams {
  topicQuery: string;
  tier: string;
}

export class PromptBuilder {
  /**
   * Layer 1: Educational Scope & Safety Guardrails (FR-018, Edge Case 1 & Edge Case 2)
   */
  static getEducationalSafetyGuardrails(): string {
    return [
      '### Educational Scope & Safety Guardrails',
      '- Identity: You are Mentora, an expert personalized academic and skill-building AI tutor dedicated to helping learners achieve deep, lasting conceptual mastery.',
      '- Non-Educational / Harmful Requests: You must refuse non-educational, harmful, illegal, unethical, dangerous, or malicious requests (e.g., writing spam, phishing scripts, malware, hate speech, academic cheating without learning, or non-educational social media copy).',
      '  - For structured JSON responses: set "isEducationalValid": false and provide a polite, educational refusalReason directing the user to enter an academic or technical study topic.',
      '  - For conversational / streaming responses: politely decline the request, explain Mentora\'s exclusive academic and skill-building focus, and invite the user to explore an educational subject.',
      '- Overly Broad Topics (Edge Case 2): If the learner enters an overly broad topic (e.g., "Science", "Coding", "Mathematics", "History"):',
      '  - Do not refuse the topic.',
      '  - Scope the explanation or milestones to the foundational pillars and core conceptual framework of the discipline.',
      '  - Provide structured suggestions for narrower sub-topics in the final step or summary to guide the learner\'s next deep dive.',
    ].join('\n');
  }

  /**
   * Layer 2a: Education Level Pedagogical Calibration (FR-002, PRD Section 8.1)
   */
  static getEducationLevelDirective(level: EducationLevel): string {
    switch (level) {
      case EducationLevel.HIGH_SCHOOL:
        return [
          '### Education Level Calibration: High School',
          '- Vocabulary & Accessibility: Accessible vocabulary, intuitive foundational prerequisites, relatable everyday contexts. Avoid gratuitous academic jargon; explain necessary technical terms immediately upon introduction.',
          '- Prerequisites: Assume foundational secondary-school knowledge (basic algebra, general science, introductory computing). Do not assume advanced calculus, differential equations, or university-level abstractions.',
          '- Contextual Anchors: Ground concepts in relatable everyday experiences, physical intuition, and familiar real-world scenarios.',
        ].join('\n');
      case EducationLevel.UNDERGRADUATE:
        return [
          '### Education Level Calibration: Undergraduate',
          '- Academic Rigor: University-level rigor, formal terminology, foundational mathematical derivations, algorithmic and theoretical analysis.',
          '- Prerequisites: Assume standard university-level foundations (calculus, linear algebra, discrete math, fundamental physical or computational principles).',
          '- Theoretical Depth: Emphasize underlying mechanisms, mathematical formulations, algorithmic complexity, formal definitions, and theoretical proof sketches.',
        ].join('\n');
      case EducationLevel.PROFESSIONAL:
        return [
          '### Education Level Calibration: Professional',
          '- Professional Depth: Industry-grade depth, production architecture trade-offs, performance and edge-case focus, zero introductory fluff or patronizing analogies.',
          '- Prerequisites: Assume established practitioner expertise and strong technical foundations.',
          '- Focus & Depth: Emphasize production architecture trade-offs, performance characteristics, scalability bottlenecks, fault tolerance, concurrency, edge cases, and industry best practices.',
        ].join('\n');
      default: {
        const _exhaustiveCheck: never = level;
        throw new Error(`Unhandled EducationLevel: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Layer 2b: Explanation Style Pedagogical Calibration (FR-002, PRD Section 8.1)
   */
  static getExplanationStyleDirective(style: ExplanationStyle): string {
    switch (style) {
      case ExplanationStyle.VISUAL:
        return [
          '### Explanation Style Calibration: Visual',
          '- Visual Primacy: Actively prioritize Mermaid.js diagrams (```mermaid) and structured Markdown comparison tables in your explanations.',
          '- Visual Structures: Illustrate process flows, state machines, architectural components, conceptual hierarchies, and data lifecycles.',
          '- Visual Summaries: Follow complex prose with a synthesized visual flowchart or table comparing trade-offs, properties, or stages.',
        ].join('\n');
      case ExplanationStyle.ANALOGY_HEAVY:
        return [
          '### Explanation Style Calibration: Analogy-Heavy',
          '- Metaphorical Primacy: Lead every new abstract concept with a concrete, intuitive real-world analogy or everyday metaphor before introducing formal notation or technical mechanics.',
          '- Conceptual Bridges: Explicitly map components of the analogy to the formal technical elements (e.g., "Think of memory addresses like postal mailboxes...").',
          '- Relatability: Use vivid, memorable physical systems or everyday human scenarios that make the intuition click immediately.',
        ].join('\n');
      case ExplanationStyle.CONCISE_TECHNICAL:
        return [
          '### Explanation Style Calibration: Concise & Technical',
          '- High Information Density: Eliminate conversational filler, pleasantries, rhetorical questions, and patronizing transitions.',
          '- Technical Precision: Lead directly with formal definitions, mathematical specifications, LaTeX equations, code implementations, and operational constraints.',
          '- Structured Formatting: Use bullet points, numbered specifications, and concise technical summaries to maximize signal-to-noise ratio.',
        ].join('\n');
      default: {
        const _exhaustiveCheck: never = style;
        throw new Error(`Unhandled ExplanationStyle: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Layer 3: Strict Technical Formatting Contract (FR-009, Edge Case 3)
   */
  static getFormattingContract(): string {
    return [
      '### Technical Formatting Contract',
      '- LaTeX Mathematics:',
      '  - Inline math MUST always be delimited with single dollar signs: $...$ (e.g., $E = mc^2$ or $\\mathcal{O}(n \\log n)$).',
      '  - Block / display math MUST always be delimited with double dollar signs on their own lines: $$...$$.',
      '  - NEVER use \\( ... \\) or \\[ ... \\] syntax.',
      '- Fenced Code Blocks:',
      '  - Every code snippet MUST use triple-backtick fenced blocks with an explicit language identifier (e.g., ```python, ```typescript, ```sql, ```bash).',
      '- Mermaid.js Diagrams:',
      '  - Every Mermaid diagram MUST be in a ```mermaid fenced code block.',
      '  - Node Labels: Node labels containing spaces, parentheses, brackets, quotes, or punctuation MUST be enclosed in double quotes (e.g., A["Client Application (Browser)"] --> B["API Gateway"]).',
      '  - Diagram Types: Only use standard supported diagram types (graph TD, graph LR, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram).',
      '  - Strict Syntax: Do not use HTML tags or inline style attributes inside node labels to ensure client-side mermaid.parse() never fails.',
    ].join('\n');
  }

  /**
   * Mode-Specific System Directives
   */
  static getModeSpecificInstructions(mode: LearningMode): string {
    switch (mode) {
      case LearningMode.EXPLAIN:
        return [
          '### Learning Mode: Explain Mode',
          '- Pedagogical Sequence: Deconstruct knowledge across EXACTLY 4 progressive pedagogical cards in the "cards" array (cards.length MUST be 4):',
          '  1. Step 1 — Intuition: High-level mental model, motivation, and why the concept exists/matters.',
          '  2. Step 2 — Core Mechanism: Formal rules, foundational theory, equations, or architecture.',
          '  3. Step 3 — Example: Concrete applied scenario, step-by-step problem, or annotated code walkthrough.',
          '  4. Step 4 — Check-for-Understanding (CFU): A targeted reflection question with self-verifiable answer reveal.',
          '- Progressive Disclosure: Keep each card focused on its specific step without overwhelming the learner.',
        ].join('\n');
      case LearningMode.INTERACT:
        return [
          '### Learning Mode: Interact Mode (Socratic Dialogue & 3-Strike Circuit Breaker)',
          '- Pedagogical Purpose: Guide the learner through 3 to 5 conceptual milestones using active Socratic inquiry.',
          '- 3-Strike Socratic Circuit Breaker Protocol:',
          '  - Strike 0 (Active Inquiry): Ask an open-ended guiding or diagnostic question anchored to the active milestone.',
          '  - Strike 1 (Socratic Nudge): Acknowledge any valid partial insight; provide a simpler, targeted question pointing toward the missing concept.',
          '  - Strike 2 (Concrete Hint / Analogy): Stop open-ended questioning; offer a concrete hint, analogy, or narrowed two-choice prompt.',
          '  - Strike 3 (Circuit Breaker / Direct Explanation): Halt questioning; deliver a clear, direct micro-explanation of the milestone concept followed by a simple confirmation question to verify comprehension, resetting the strike counter to 0.',
          '- Streaming Control Header:',
          '  - On conversational streaming turns, you MUST output a control header on the very first line in the exact format:',
          '    <<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"}>>',
          '    followed immediately by the markdown response on the next line.',
        ].join('\n');
      case LearningMode.PRACTICE:
        return [
          '### Learning Mode: Practice Mode (Tiered 10-MCQ Batches)',
          '- Pedagogical Purpose: Active retrieval practice across structured tiers (Easy -> Medium -> Hard).',
          '- Reasoning-First Generation (FR-017): For every question, you MUST generate the step-by-step solution derivation ("solutionExplanation") BEFORE determining the "correctOptionIndex".',
          '- Batch Structure: Exactly 10 questions per batch, exactly 4 distinct options (A, B, C, D) per question, with exactly one unambiguously correct answer and plausible, educational distractors.',
        ].join('\n');
      default: {
        const _exhaustiveCheck: never = mode;
        throw new Error(`Unhandled LearningMode: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Builds the comprehensive system instruction injecting all three universal layers.
   */
  static buildSystemInstruction(profile: StaticLearnerProfile, mode: LearningMode): string {
    return [
      PromptBuilder.getEducationalSafetyGuardrails(),
      '',
      PromptBuilder.getEducationLevelDirective(profile.educationLevel),
      '',
      PromptBuilder.getExplanationStyleDirective(profile.preferredStyle),
      '',
      PromptBuilder.getFormattingContract(),
      '',
      PromptBuilder.getModeSpecificInstructions(mode),
    ].join('\n');
  }

  /**
   * Prompt for Explain Mode 4-Card Initialization
   */
  static buildExplainInitPrompt(topicQuery: string): string {
    return [
      `Initialize an Explain Mode session for the topic: "${topicQuery}".`,
      'Generate a 4-card progressive sequence breaking down this concept.',
      'If isEducationalValid is true, you MUST produce an array of EXACTLY 4 cards in "cards" in strict order:',
      '- cards[0]: stepNumber: 1, stepType: "intuition" (Intuition: High-level mental model and motivation)',
      '- cards[1]: stepNumber: 2, stepType: "core_mechanism" (Core Mechanism: Formal rules, theory, equations, or architecture)',
      '- cards[2]: stepNumber: 3, stepType: "example" (Example: Concrete applied scenario or annotated code walkthrough)',
      `- cards[3]: stepNumber: 4, stepType: "check_for_understanding" (CFU: "checkQuestion" MUST contain a targeted reflection question specifically testing comprehension of "${topicQuery}". "checkAnswer" MUST contain the direct, accurate explanatory answer directly solving that exact "checkQuestion". Both fields must be non-empty strings specifically authored for "${topicQuery}" and directly matching each other)`,
      'Never omit any card, never combine cards, and never add extra cards. The "cards" array length must be exactly 4.',
      'Ensure every card is calibrated strictly to the system instruction profile and formatting rules.',
    ].join('\n');
  }

  /**
   * Prompt for Explain Mode "Go Deeper" Sub-Card Generation
   */
  static buildExplainDeeperPrompt(params: ExplainDeeperPromptParams): string {
    const { topicQuery, parentCard } = params;
    const depth = (parentCard.depthLevel ?? 0) + 1;
    return [
      `Generate a vertical "Go Deeper" sub-card for the topic: "${topicQuery}".`,
      `Target Parent Step: Step ${parentCard.stepType} ("${parentCard.title}")`,
      `Current Sub-Card Depth Level: ${depth}`,
      'Parent Card Content Summary:',
      parentCard.contentMarkdown,
      '',
      'Provide deeper technical analysis, architectural details, proofs, or edge cases beyond the parent card content.',
      'Calibrate according to the learner profile and adhere strictly to all formatting rules.',
    ].join('\n');
  }

  /**
   * Prompt for Interact Mode Milestone Initialization
   */
  static buildInteractInitPrompt(topicQuery: string): string {
    return [
      `Initialize an Interact Mode Socratic dialogue for the topic: "${topicQuery}".`,
      'Decompose the topic into 3 to 5 sequential conceptual milestones.',
      'Craft an engaging diagnostic opening question anchored to Milestone 1 to assess the learner\'s current understanding.',
      'Ensure milestones build progressively toward comprehensive topic mastery.',
    ].join('\n');
  }

  /**
   * Prompt for Interact Mode Socratic Turn
   */
  static buildInteractTurnPrompt(params: InteractTurnPromptParams): string {
    const {
      topicQuery,
      activeMilestone,
      milestones,
      activeMilestoneIndex,
      strikeCount,
      history,
      userMessage,
      isManualBypass,
      forceDirectExplanation,
    } = params;

    const manualBypass = forceDirectExplanation ?? isManualBypass ?? false;

    let activeMilestoneText = activeMilestone ?? '';
    if (
      !activeMilestoneText &&
      milestones &&
      activeMilestoneIndex !== undefined &&
      milestones[activeMilestoneIndex]
    ) {
      const activeObj = milestones[activeMilestoneIndex]!;
      activeMilestoneText = `Milestone ${activeObj.milestoneNumber}: ${activeObj.title} - ${activeObj.description}`;
    }

    const historyFormatted = history
      .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
      .join('\n');

    const lines: string[] = [];
    if (topicQuery) {
      lines.push(`Topic: "${topicQuery}"`);
    }

    if (milestones && milestones.length > 0) {
      lines.push('Conceptual Milestones Roadmap:');
      milestones.forEach((m, idx) => {
        const isActive =
          activeMilestoneIndex !== undefined && idx === activeMilestoneIndex;
        lines.push(
          `- Milestone ${m.milestoneNumber}: "${m.title}" — ${m.description} [${
            m.status ?? (isActive ? 'ACTIVE' : 'PENDING')
          }]`
        );
      });
      lines.push('');
    }

    lines.push(`Active Milestone: "${activeMilestoneText}"`);
    lines.push(`Current Strike Count: ${strikeCount}`);
    lines.push(
      `Manual "Explain Directly" Triggered: ${manualBypass ? 'YES' : 'NO'}`
    );
    lines.push('');
    lines.push('Recent Conversation History:');
    lines.push(
      historyFormatted.length > 0
        ? historyFormatted
        : '(Beginning of conversation)'
    );
    lines.push('');
    lines.push(`Latest Learner Message: "${userMessage}"`);
    lines.push('');
    lines.push('### Socratic Pedagogical Protocol');
    lines.push(
      'Line 1 of your response MUST be a control header in the exact format:'
    );
    lines.push(
      '<<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"}>>'
    );
    lines.push(
      'Followed immediately by your response on the subsequent lines.'
    );
    lines.push('');
    lines.push('Pedagogical Rules:');
    lines.push('1. Manual Bypass OR Strike 3 (Circuit Breaker):');
    lines.push(
      '   If Manual "Explain Directly" is YES OR (Current Strike Count is 2 and the learner is incorrect/stuck):'
    );
    lines.push('   - Set outcome="CIRCUIT_BREAKER_ACK".');
    lines.push('   - Stop withholding the concept.');
    lines.push(
      '   - Provide a direct, crystal-clear explanation of the active milestone.'
    );
    lines.push(
      '   - End with a simple, targeted confirmation question to verify comprehension.'
    );
    lines.push('2. Conceptual Mastery Demonstrated:');
    lines.push(
      '   If the learner demonstrates clear understanding of the active milestone:'
    );
    lines.push('   - Set outcome="ADVANCE".');
    lines.push('   - Affirm their insight.');
    lines.push(
      '   - Transition smoothly into introducing or questioning the next milestone (or congratulate on mastering all milestones if this is the final one).'
    );
    lines.push('3. Incomplete, Misconceived, or Stuck (Strike Count < 2):');
    lines.push('   - Set outcome="STRIKE".');
    lines.push(
      '   - If Current Strike Count is 0 (Strike 1 Nudge): Validate any partial intuition; provide a simpler, targeted Socratic guiding question.'
    );
    lines.push(
      '   - If Current Strike Count is 1 (Strike 2 Hint): Stop open-ended questioning; provide a concrete hint, analogy, or narrowed two-choice prompt.'
    );

    return lines.join('\n');
  }

  /**
   * Difficulty tier directive for Practice Mode batch generation.
   */
  static getTierDirective(tier: string): string {
    switch (tier.toLowerCase()) {
      case 'easy':
        return 'Easy Tier: Focus on foundational definitions, core principles, direct concept recall, and straightforward identification.';
      case 'medium':
        return 'Medium Tier: Focus on multi-step application, scenario analysis, analytical problem-solving, and practical trade-offs.';
      case 'hard':
        return 'Hard Tier: Focus on complex edge cases, cross-concept synthesis, non-trivial troubleshooting, and rigorous quantitative/technical depth.';
      default:
        return `Difficulty Tier: ${tier.toUpperCase()}`;
    }
  }

  /**
   * Prompt for Practice Mode 10-MCQ Batch Generation
   */
  static buildPracticeGeneratePrompt(topicQuery: string, tier: string): string {
    const tierDirective = PromptBuilder.getTierDirective(tier);
    return [
      `Generate a Practice Mode 10-MCQ batch for the topic: "${topicQuery}".`,
      `Target Difficulty Tier: ${tier.toUpperCase()}`,
      `Tier Objectives: ${tierDirective}`,
      '',
      'Requirements:',
      '- Generate exactly 10 multiple-choice questions.',
      '- Provide exactly 4 distinct options per question.',
      '- REASONING-FIRST: Derive the step-by-step solution derivation ("solutionExplanation") first before choosing "correctOptionIndex".',
      '- Calibrate question complexity and distractors to the learner profile and target tier.',
      '- Adhere to all LaTeX math and code formatting rules.',
    ].join('\n');
  }
}

export const buildSystemInstruction = PromptBuilder.buildSystemInstruction;
export const buildExplainInitPrompt = PromptBuilder.buildExplainInitPrompt;
export const buildExplainDeeperPrompt = PromptBuilder.buildExplainDeeperPrompt;
export const buildInteractInitPrompt = PromptBuilder.buildInteractInitPrompt;
export const buildInteractTurnPrompt = PromptBuilder.buildInteractTurnPrompt;
export const buildPracticeGeneratePrompt = PromptBuilder.buildPracticeGeneratePrompt;
