/**
 * Guided Pro revision: section targets, placement validation, and change summaries.
 */

export type GuidedRevisionTarget = {
  questionKey: string;
  sectionNumber: number | null;
  sectionLabel: string;
  instructionSectionLine: string;
  headingPatterns: RegExp[];
  forbiddenBeforeSection1: RegExp[];
};

export type GuidedPlacementValidation = {
  ok: boolean;
  reasons: string[];
};

export type GuidedSectionAnchor = {
  found: boolean;
  lineIndex: number;
  headingText: string;
};

const TARGET_BY_QUESTION: Record<string, Omit<GuidedRevisionTarget, "questionKey">> = {
  payment_timing: {
    sectionNumber: 2,
    sectionLabel: "Fees and Payment",
    instructionSectionLine: "Section 2 — Fees and Payment and/or Schedule A Commercial Terms",
    headingPatterns: [/^\s*2\.\s+.*(?:FEES|PAYMENT|COMPENSATION)/i, /SCHEDULE\s+A/i],
    forbiddenBeforeSection1: [
      /\b(?:uptime|sla|service\s+level)\b/i,
      /\b(?:intellectual\s+property|work\s+product|ownership\s+of)\b/i,
    ],
  },
  payment_structure: {
    sectionNumber: 2,
    sectionLabel: "Fees and Payment",
    instructionSectionLine: "Section 2 — Fees and Payment and/or Schedule A Commercial Terms",
    headingPatterns: [/^\s*2\.\s+.*(?:FEES|PAYMENT|COMPENSATION)/i, /SCHEDULE\s+A/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\bownership\b/i],
  },
  total_fee_confirmation: {
    sectionNumber: 2,
    sectionLabel: "Fees and Payment",
    instructionSectionLine: "Section 2 — Fees and Payment and/or Schedule A Commercial Terms",
    headingPatterns: [/^\s*2\.\s+.*(?:FEES|PAYMENT|COMPENSATION)/i, /SCHEDULE\s+A/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\bownership\b/i],
  },
  project_fee_phase_confirmation: {
    sectionNumber: 2,
    sectionLabel: "Fees and Payment",
    instructionSectionLine: "Section 2 — Fees and Payment and/or Schedule A Commercial Terms",
    headingPatterns: [/^\s*2\.\s+.*(?:FEES|PAYMENT|COMPENSATION)/i, /SCHEDULE\s+A/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\bownership\b/i],
  },
  phase_payment_allocation: {
    sectionNumber: 2,
    sectionLabel: "Fees and Payment",
    instructionSectionLine: "Section 2 — Fees and Payment and/or Schedule A Commercial Terms",
    headingPatterns: [/^\s*2\.\s+.*(?:FEES|PAYMENT|COMPENSATION)/i, /SCHEDULE\s+A/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\bownership\b/i],
  },
  ip_ownership: {
    sectionNumber: 4,
    sectionLabel: "Ownership and Work Product",
    instructionSectionLine: "Section 4 — Ownership and Work Product (Intellectual Property)",
    headingPatterns: [/^\s*4\.\s+.*(?:INTELLECTUAL|OWNERSHIP|WORK\s+PRODUCT)/i],
    forbiddenBeforeSection1: [/\b(?:net\s+\d+|invoice|monthly\s+fee)\b/i, /\b(?:uptime|sla)\b/i],
  },
  ip_allocation: {
    sectionNumber: 4,
    sectionLabel: "Ownership and Work Product",
    instructionSectionLine: "Section 4 — Ownership and Work Product (Intellectual Property)",
    headingPatterns: [/^\s*4\.\s+.*(?:INTELLECTUAL|OWNERSHIP|WORK\s+PRODUCT)/i],
    forbiddenBeforeSection1: [/\b(?:net\s+\d+|invoice)\b/i, /\b(?:uptime|sla)\b/i],
  },
  saas_sla: {
    sectionNumber: 5,
    sectionLabel: "Support Expectations",
    instructionSectionLine: "Section 5 — Support Expectations (SLA / uptime if applicable)",
    headingPatterns: [/^\s*5\.\s+.*(?:SUPPORT|SLA|SERVICE\s+LEVEL|MAINTENANCE)/i],
    forbiddenBeforeSection1: [/\b(?:total\s+fee|invoice|net\s+\d+)\b/i, /\bwork\s+product\s+ownership\b/i],
  },
  support_obligations: {
    sectionNumber: 5,
    sectionLabel: "Support Expectations",
    instructionSectionLine: "Section 5 — Support Expectations",
    headingPatterns: [/^\s*5\.\s+.*(?:SUPPORT|SLA|MAINTENANCE)/i],
    forbiddenBeforeSection1: [/\b(?:total\s+fee|invoice)\b/i, /\bownership\s+of\s+deliverables\b/i],
  },
  renewal_notice: {
    sectionNumber: 6,
    sectionLabel: "Term and Termination",
    instructionSectionLine: "Section 6 — Term and Termination",
    headingPatterns: [/^\s*6\.\s+.*(?:TERM|TERMINAT)/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\b(?:invoice|payment\s+timing)\b/i],
  },
  security_obligations: {
    sectionNumber: 3,
    sectionLabel: "Confidentiality",
    instructionSectionLine: "Section 3 — Confidentiality",
    headingPatterns: [/^\s*3\.\s+.*CONFIDENTIAL/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i, /\b(?:total\s+fee|phase\s+allocation)\b/i],
  },
  nda_survival: {
    sectionNumber: 3,
    sectionLabel: "Confidentiality",
    instructionSectionLine: "Section 3 — Confidentiality",
    headingPatterns: [/^\s*3\.\s+.*CONFIDENTIAL/i],
    forbiddenBeforeSection1: [/\b(?:uptime|sla)\b/i],
  },
  deal_terms_confirmation: {
    sectionNumber: null,
    sectionLabel: "General terms",
    instructionSectionLine: "the most appropriate existing section for the unresolved terms (do not add new sections above Section 1)",
    headingPatterns: [/^\s*\d+\.\s+/i],
    forbiddenBeforeSection1: [],
  },
};

const DEFAULT_TARGET: Omit<GuidedRevisionTarget, "questionKey"> = {
  sectionNumber: null,
  sectionLabel: "Agreement terms",
  instructionSectionLine: "the most appropriate existing numbered section",
  headingPatterns: [/^\s*\d+\.\s+[A-Z]/i],
  forbiddenBeforeSection1: [/\bbuild\s+and\b/i, /\bmaintain\s+such\s+systems\b/i],
};

const ORPHAN_FRAGMENT_RE = [
  /\bbuild\s+and\s*[,.\s]*$/im,
  /\bmaintain\s+such\s+systems\b/i,
  /^\s*and\s+provide\b/im,
];
const DUPLICATE_RECITAL_RE = /(?:service\s+provider|between\s+the\s+parties)[\s\S]{0,200}(?:service\s+provider|between\s+the\s+parties)/gi;

function firstSection1Index(text: string): number {
  const m = text.match(/^\s*1\.\s+/m);
  return m?.index ?? -1;
}

export function resolveGuidedQuestionTarget(questionKey: string): GuidedRevisionTarget {
  const base = TARGET_BY_QUESTION[questionKey] ?? DEFAULT_TARGET;
  return { questionKey, ...base };
}

export function buildSectionOnlyRefineInstruction(
  target: GuidedRevisionTarget,
  answer: string,
  variableLabel: string,
  strict = false,
): string {
  const a = (answer || "").trim();
  if (!a) return "";
  const prefix = strict
    ? `CRITICAL: Revise ONLY ${target.instructionSectionLine}. Do NOT change the title, preamble, party recital, signature block, or any other section. Do NOT insert new clauses before Section 1. `
    : `Revise only ${target.instructionSectionLine}. Keep the title, preamble, party recital, and unrelated sections unchanged. `;
  return `${prefix}Update "${variableLabel}" to reflect: ${a}.`;
}

export function findSectionAnchor(documentText: string, target: GuidedRevisionTarget): GuidedSectionAnchor {
  const lines = documentText.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (target.headingPatterns.some((p) => p.test(line))) {
      return { found: true, lineIndex: i, headingText: line };
    }
    if (target.sectionNumber != null) {
      const numRe = new RegExp(`^\\s*${target.sectionNumber}\\.\\s+`, "i");
      if (numRe.test(line)) {
        return { found: true, lineIndex: i, headingText: line };
      }
    }
  }
  return { found: false, lineIndex: -1, headingText: "" };
}

export function computeChangedSectionRange(
  beforeText: string,
  afterText: string,
  target: GuidedRevisionTarget,
): string {
  const anchor = findSectionAnchor(afterText, target);
  if (!anchor.found) {
    const delta = afterText.length - beforeText.length;
    if (Math.abs(delta) < 8) return "Minor wording adjustments.";
    return "Agreement updated with your answer.";
  }
  const lines = afterText.replace(/\r\n/g, "\n").split("\n");
  const start = anchor.lineIndex;
  let end = start + 1;
  while (end < lines.length) {
    const t = lines[end].trim();
    if (/^\d+\.\s+[A-Z]/.test(t) && end > start + 1) break;
    if (t.length === 0 && end > start + 4) break;
    end += 1;
  }
  const snippet = lines.slice(start, Math.min(end, start + 12)).join("\n").trim();
  return snippet.slice(0, 420);
}

export function validateGuidedPatchPlacement(
  beforeText: string,
  afterText: string,
  target: GuidedRevisionTarget,
): GuidedPlacementValidation {
  const reasons: string[] = [];
  const before = (beforeText || "").trim();
  const after = (afterText || "").trim();
  if (!after || after.length < 200) {
    reasons.push("output_too_short");
  }
  const s1 = firstSection1Index(after);
  const preamble = s1 >= 0 ? after.slice(0, s1) : after.slice(0, 1200);
  for (const frag of ORPHAN_FRAGMENT_RE) {
    if (frag.test(after)) reasons.push("orphan_fragment");
  }
  if ((after.match(DUPLICATE_RECITAL_RE) || []).length > 1) {
    reasons.push("duplicate_recital");
  }
  for (const forbidden of target.forbiddenBeforeSection1) {
    if (forbidden.test(preamble)) reasons.push(`misplaced_clause:${forbidden.source}`);
  }
  if (s1 >= 0) {
    const beforeS1 = firstSection1Index(before);
    const beforePreamble = beforeS1 >= 0 ? before.slice(0, beforeS1) : before.slice(0, 1200);
    if (preamble.length > beforePreamble.length + 180 && target.sectionNumber != null && target.sectionNumber > 1) {
      reasons.push("preamble_grew");
    }
  }
  if (target.sectionNumber != null && target.sectionNumber > 1) {
    const misplacedIp = /\b(?:intellectual\s+property|work\s+product|ownership\s+of\s+deliverables)\b/i.test(
      preamble,
    );
    const misplacedPay = /\b(?:total\s+fee|invoic(?:e|ing)|net\s+\d+)\b/i.test(preamble);
    const misplacedSla = /\b(?:uptime|service\s+level|response\s+time)\b/i.test(preamble);
    if (misplacedIp) reasons.push("ip_before_section_1");
    if (misplacedPay) reasons.push("payment_before_section_1");
    if (misplacedSla) reasons.push("sla_before_section_1");
  }
  return { ok: reasons.length === 0, reasons };
}

export function buildGuidedChangeSummary(args: {
  questionKey: string;
  answerLabel: string;
  target: GuidedRevisionTarget;
  refineSummary?: string | null;
}): { summary: string; sectionLabel: string } {
  const sectionLabel = args.target.sectionNumber
    ? `Section ${args.target.sectionNumber} — ${args.target.sectionLabel}`
    : args.target.sectionLabel;
  const custom = (args.refineSummary || "").trim();
  const summary =
    custom.length > 12 && custom.length < 220
      ? custom
      : `Confirmed ${args.answerLabel.trim() || "your answer"} for ${args.target.sectionLabel.toLowerCase()}.`;
  return { summary, sectionLabel };
}

export function resolveRecommendReasonForPill(
  variableId: string,
  pillId: string,
  intakeRaw?: string | null,
): string | null {
  const intake = (intakeRaw || "").trim();
  if (pillId === "recommend") return null;
  if (/\bmonthly\b/i.test(intake) && (variableId === "payment_timing" || variableId === "total_fee_confirmation")) {
    return "Recommended because your prompt mentions a monthly fee but the draft still needs clear payment timing.";
  }
  if (/\b(?:support|sla|uptime)\b/i.test(intake) && (variableId === "saas_sla" || variableId === "support_obligations")) {
    return "Recommended because your prompt mentions support expectations but not measurable response or coverage.";
  }
  if (/\b(?:ownership|ip|deliverable|work\s+product)\b/i.test(intake) && /ip_/.test(variableId)) {
    return "Recommended because your prompt mentions ownership of what gets built but the agreement does not state it clearly yet.";
  }
  if (/\bterminat/i.test(intake) && variableId === "renewal_notice") {
    return "Recommended because your prompt asks to end the deal if it is not working but notice period is still open.";
  }
  if (/\bconfidential/i.test(intake) && variableId === "security_obligations") {
    return "Recommended because your prompt asks for confidentiality and the draft should state practical mutual duties.";
  }
  if (/\b(?:phase|build|rollout)\b/i.test(intake) && /phase|fee/.test(variableId)) {
    return "Recommended because your prompt describes phased work but fees are not split in the draft yet.";
  }
  return null;
}

export const GUIDED_PLACEMENT_RETRY_USER_MESSAGE =
  "That update needs a cleaner pass. Please try again or use Custom.";

export function logGuidedRefineTargetResolved(target: GuidedRevisionTarget): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-refine-target-resolved]", {
    questionKey: target.questionKey,
    section: target.sectionLabel,
    sectionNumber: target.sectionNumber,
  });
}

export function logGuidedRefinePlacementAccepted(questionKey: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-refine-placement-accepted]", { questionKey });
}

export function logGuidedRefinePlacementRejected(questionKey: string, reasons: string[]): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-refine-placement-rejected]", { questionKey, reasons });
}

export function logGuidedRefineAnchorFound(questionKey: string, heading: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-refine-anchor-found]", { questionKey, heading: heading.slice(0, 80) });
}

export function logGuidedRefineAnchorMissing(questionKey: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-refine-anchor-missing]", { questionKey });
}
