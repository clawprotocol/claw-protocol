/**
 * Post-guided bulk apply: prompt quality, light deterministic polish, and validation.
 * Agreement-family agnostic — uses session answers and universal section families only.
 */

import { NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../../../compliance/disclosureCopy";
import { scanBodyMaterialPlaceholders } from "./bodyMaterialPlaceholderScanner";
import type { GuidedCompletionSession } from "./types";
import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";

export const GUIDED_DISCLAIMER_FRAGMENTS = [
  NOT_LEGAL_ADVICE,
  "not legal advice",
  "not a law firm",
  PRODUCT_NOT_LAW_FIRM,
  "confirm material terms",
  "independent counsel",
  "licensed legal counsel",
] as const;

const ORPHAN_FRAGMENT_RE =
  /\b(?:build\s+and|maintain\s+such\s+systems)\b(?=[\s\S]{0,120}?(?:\n\s*\d+\.|SECTION\s+1\b))/i;

const NUMBERED_HEADING_RE = /^\s*(\d+(?:\.\d+)*)\.\s+([A-Za-z][^\n]{2,72})\s*$/gm;

const TOPIC_FAMILY_RULES: readonly { family: string; re: RegExp }[] = [
  { family: "fees", re: /\b(?:fees?|payment|compensation|invoic|schedule\s+a)\b/i },
  { family: "sla", re: /\b(?:support|sla|uptime|service\s+level)\b/i },
  { family: "ownership", re: /\b(?:ownership|intellectual\s+property|work\s+product)\b/i },
  { family: "termination", re: /\b(?:term(?:ination)?|renewal|notice\s+period)\b/i },
  { family: "confidentiality", re: /\b(?:confidential|non-?disclosure|nda)\b/i },
];

export type GuidedPostApplyQualityResult = {
  ok: boolean;
  reasons: string[];
  metrics: {
    beforeLen: number;
    afterLen: number;
    numberedHeadingsBefore: number;
    numberedHeadingsAfter: number;
    duplicateTopicFamilies: string[];
    placeholderHits: number;
    answersMissing: string[];
    disclaimersPreserved: boolean;
  };
};

/** Per-answer synthesis hints so bulk regen materially rewrites operative language. */
export function materialRewriteHintForGuidedAnswer(variableId: string, answer: string): string | null {
  const a = (answer || "").trim().toLowerCase();
  const id = variableId.toLowerCase();
  if (!a) return null;
  if (/99\.9|uptime|sla/i.test(a) || /sla|uptime|support_obligations/i.test(id)) {
    if (/99\.9/.test(a)) {
      return "Rewrite Section 5 with explicit 99.9% monthly uptime target, measurement method, exclusions, and remedy/credit language.";
    }
    if (/business.?hour|9\s*[-–]\s*5|weekday/i.test(a)) {
      return "Rewrite Section 5 with business-hours support window, response-time targets, and escalation path.";
    }
    return "Rewrite Section 5 support/SLA with measurable response targets and scope boundaries.";
  }
  if (/phase|milestone|deposit|installment|net\s*\d/i.test(a) || /payment|fee|phase/i.test(id)) {
    if (/phase|milestone|installment/i.test(a)) {
      return "Rewrite Section 2 and Schedule A with milestone-based payment schedule, due dates, and late-payment terms tied to deliverables.";
    }
    if (/monthly|retainer/i.test(a)) {
      return "Rewrite Section 2 with recurring monthly fee, invoice timing, and payment due dates.";
    }
    return "Rewrite Section 2 Fees and Payment with concrete amounts, timing, and invoicing language matching the answer.";
  }
  if (/client.*own|company.*own|provider.*own|assign|work.?product|ip/i.test(a) || /ip|ownership/i.test(id)) {
    if (/client|company|customer/i.test(a)) {
      return "Rewrite Section 4 so deliverables and work product are assigned to the client, with provider background-IP license carve-out.";
    }
    if (/provider|vendor|consultant/i.test(a)) {
      return "Rewrite Section 4 so provider retains IP with a broad license to the client for deliverables.";
    }
    return "Rewrite Section 4 Ownership and Work Product to match the selected allocation explicitly.";
  }
  if (/confidential|nda|security/i.test(id)) {
    return "Rewrite Section 3 Confidentiality with practical duties, permitted disclosures, and survival period from the answer.";
  }
  if (/terminat|renewal/i.test(id)) {
    return "Rewrite Section 6 Term and Termination with notice period and exit mechanics from the answer.";
  }
  return null;
}

function countNumberedHeadings(text: string): number {
  return (text.match(/^\s*\d+(?:\.\d+)*\.\s+[A-Z]/gm) || []).length;
}

function headingTopicFamily(title: string): string | null {
  const t = title.trim().toLowerCase();
  for (const { family, re } of TOPIC_FAMILY_RULES) {
    if (re.test(t)) return family;
  }
  return null;
}

/** Major section families should not appear as separate numbered headings more than once. */
export function detectDuplicateTopicSectionHeadings(text: string): string[] {
  const familyCounts = new Map<string, number>();
  let m: RegExpExecArray | null;
  const re = new RegExp(NUMBERED_HEADING_RE.source, NUMBERED_HEADING_RE.flags);
  while ((m = re.exec(text)) !== null) {
    const family = headingTopicFamily(m[2] || "");
    if (!family) continue;
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }
  return [...familyCounts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
}

export function bodyContainsDisclaimerFragments(text: string): boolean {
  const t = (text || "").toLowerCase();
  return GUIDED_DISCLAIMER_FRAGMENTS.some((frag) => t.includes(frag.toLowerCase()));
}

export function validateDisclaimerPreserved(before: string, after: string): boolean {
  if (!bodyContainsDisclaimerFragments(before)) return true;
  return bodyContainsDisclaimerFragments(after);
}

/** Significant tokens from guided answers should appear in the post-guided body. */
export function guidedAnswersPresentInBody(
  session: GuidedCompletionSession,
  body: string,
): { ok: boolean; missing: string[] } {
  const hay = (body || "").toLowerCase();
  const missing: string[] = [];
  for (const id of session.queue) {
    const answer = (session.answered[id] || "").trim();
    if (!answer) continue;
    const numeric = answer.match(/\d+(?:\.\d+)?%?|\$[\d,]+(?:\.\d{2})?|net\s*\d+/gi) || [];
    const words = answer
      .toLowerCase()
      .split(/[^a-z0-9%$]+/)
      .filter((w) => w.length >= 5)
      .slice(0, 4);
    const hit =
      numeric.some((tok) => hay.includes(tok.toLowerCase().replace(/\s+/g, ""))) ||
      words.filter((w) => hay.includes(w)).length >= Math.min(2, words.length);
    if (!hit) missing.push(id);
  }
  return { ok: missing.length === 0, missing };
}

/** Collapse blank-line bloat and exact duplicate paragraphs without changing operative meaning. */
export function applyGuidedPostApplyLightPolish(_before: string, after: string): string {
  let text = (after || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const blocks = text.split(/\n\n+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const norm = block.replace(/\s+/g, " ").trim().toLowerCase();
    if (norm.length < 48) {
      out.push(block);
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(block);
  }
  return out.join("\n\n").trim();
}

export function buildConsolidatedGuidedRegenerationPrompt(args: {
  intakeText: string;
  session: GuidedCompletionSession;
}): string {
  const intake = (args.intakeText || "").trim();
  const lines: string[] = [
    "LAWDOG PRO — apply ALL guided answers in ONE authoritative regeneration of the full agreement.",
    "",
    "Quality goals (all agreement types: services, contractor, NDA, marketing, SaaS, multi-party):",
    "- Integrate each answer by REWRITING the correct existing numbered section in place — do not add parallel duplicate sections.",
    "- Improve clarity and commercial tailoring; do NOT pad length with repeated boilerplate or copy-paste legalese.",
    "- One clear operative block per topic: fees/payment, confidentiality, ownership/IP, support/SLA, term/termination.",
    "- Schedule A (if present) should reflect payment/support answers without repeating Section 2 verbatim.",
    "",
    "Preserve verbatim (do not delete or weaken):",
    `- Disclaimers and safety copy including "${NOT_LEGAL_ADVICE}" and "${PRODUCT_NOT_LAW_FIRM}" when already present`,
    "- Party block, recital, preamble, signature block, and overall numbered section order",
    "",
    "Avoid:",
    "- Duplicate party recitals or second copies of the same section heading (e.g. two Fees or two Support sections)",
    '- Orphan fragments before Section 1 (e.g. "build and", "maintain such systems")',
    "- Unresolved placeholders: to be confirmed, TBD, [INSERT], or empty heading-only sections",
    "",
    "Section map (rewrite in place):",
    "- Fees / payment / phases → Section 2 Fees and Payment and/or Schedule A Commercial Terms",
    "- Confidentiality → Section 3 Confidentiality",
    "- IP / deliverables → Section 4 Ownership and Work Product",
    "- SLA / support → Section 5 Support Expectations",
    "- Termination / renewal → Section 6 Term and Termination",
    "",
    "Original intake:",
    intake || "(not provided)",
    "",
    "Guided answers to implement:",
  ];

  for (const id of args.session.queue) {
    const answer = (args.session.answered[id] || "").trim();
    if (!answer) continue;
    const variable = args.session.variables.find((v) => v.id === id);
    const target = resolveGuidedQuestionTarget(id);
    const cfg = resolveGuidedQuestionConfig(id);
    const materialHint = materialRewriteHintForGuidedAnswer(id, answer);
    const area = cfg.finalAppliedAreaLabel || cfg.targetSectionLabel;
    lines.push(
      `- [${area}] ${variable?.label ?? id} → ${target.instructionSectionLine}: ${answer}${
        materialHint ? ` | Rewrite: ${materialHint}` : ""
      }`,
    );
  }

  lines.push(
    "",
    "Return the complete updated agreement text only. Tighter tailored prose beats longer generic repetition.",
  );

  return lines.join("\n");
}

export function validateGuidedBulkRegenerationLength(beforeText: string, afterText: string): {
  ok: boolean;
  reasons: string[];
} {
  const before = (beforeText || "").trim();
  const after = (afterText || "").trim();
  const reasons: string[] = [];
  if (after.length < Math.max(500, before.length * 0.45)) {
    reasons.push("output_too_short");
  }
  if (before.length >= 800 && after.length < before.length * 0.72) {
    reasons.push("output_shrunk_unexpectedly");
  }
  if (before.length >= 800 && after.length > before.length * 1.85) {
    reasons.push("output_bloated_vs_initial");
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateGuidedPostApplyQuality(
  beforeText: string,
  afterText: string,
  session: GuidedCompletionSession | null,
): GuidedPostApplyQualityResult {
  const before = (beforeText || "").trim();
  const after = (afterText || "").trim();
  const reasons: string[] = [];

  const lenCheck = validateGuidedBulkRegenerationLength(before, after);
  reasons.push(...lenCheck.reasons);

  const numberedHeadingsBefore = countNumberedHeadings(before);
  const numberedHeadingsAfter = countNumberedHeadings(after);
  if (numberedHeadingsBefore >= 4 && numberedHeadingsAfter < Math.max(3, numberedHeadingsBefore - 2)) {
    reasons.push("section_structure_collapsed");
  }

  const duplicateTopicFamilies = detectDuplicateTopicSectionHeadings(after);
  if (duplicateTopicFamilies.length > 0) {
    reasons.push(`duplicate_topic_sections:${duplicateTopicFamilies.join(",")}`);
  }

  if (ORPHAN_FRAGMENT_RE.test(after)) {
    reasons.push("orphan_fragment_before_section_1");
  }

  const placeholderHits = scanBodyMaterialPlaceholders(after).length;
  if (placeholderHits > 0) {
    reasons.push("placeholder_regression");
  }

  const disclaimersPreserved = validateDisclaimerPreserved(before, after);
  if (!disclaimersPreserved) {
    reasons.push("disclaimer_stripped");
  }

  let answersMissing: string[] = [];
  if (session) {
    const presence = guidedAnswersPresentInBody(session, after);
    answersMissing = presence.missing;
    if (!presence.ok && answersMissing.length > session.queue.filter((id) => session.answered[id]).length / 2) {
      reasons.push("guided_answers_not_integrated");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    metrics: {
      beforeLen: before.length,
      afterLen: after.length,
      numberedHeadingsBefore,
      numberedHeadingsAfter,
      duplicateTopicFamilies,
      placeholderHits,
      answersMissing,
      disclaimersPreserved,
    },
  };
}

export function logGuidedPostApplyQuality(result: GuidedPostApplyQualityResult): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.info("[guided-post-apply-quality-ok]", result.metrics);
  } else {
    // eslint-disable-next-line no-console
    console.warn("[guided-post-apply-quality-failed]", {
      reasons: result.reasons,
      metrics: result.metrics,
    });
  }
}
