/**
 * Scan visible Pro body for unresolved commercial placeholders and empty clause shells.
 * Drives material missing items + guided completion (not acceptable as polished fallback).
 */

import type { CommercialFamilyHint, MaterialMissingItem } from "../proAgreementCompleteness/types";

const BODY_PLACEHOLDER_RULES: readonly {
  id: string;
  re: RegExp;
  label: string;
  question: string;
  whyItMatters: string;
  suggestedAnswerFormat: string;
  affectsSections: string[];
}[] = [
  {
    id: "supplemental_schedule_confirmation",
    re: /\bto be confirmed in a supplemental schedule\b/i,
    label: "Schedule / supplemental terms",
    question: "What should go in the supplemental schedule (fees, phases, support)?",
    whyItMatters: "Unresolved schedule language blocks execution — confirm amounts and phase timing.",
    suggestedAnswerFormat: "e.g. $120k total split 40/40/20 across build, rollout, support",
    affectsSections: ["Schedule A", "Compensation", "Fees"],
  },
  {
    id: "writing_before_execution",
    re: /\bto be confirmed in writing before execution\b/i,
    label: "Pre-execution confirmation",
    question: "What commercial terms must be confirmed in writing before execution?",
    whyItMatters: "The agreement defers key economics until later — specify them now or in Schedule A.",
    suggestedAnswerFormat: "e.g. fee table, SLA, payment due dates",
    affectsSections: ["Compensation", "General"],
  },
  {
    id: "amount_to_be_confirmed",
    re: /\bamount:\s*to be confirmed\b/i,
    label: "Fee amount",
    question: "What is the total fee or pricing structure?",
    whyItMatters: "Payment amount is still open — confirm total and allocation across phases.",
    suggestedAnswerFormat: "e.g. $120,000 total; 40% on build acceptance",
    affectsSections: ["Compensation", "Fees", "Schedule A"],
  },
  {
    id: "payment_timing_to_be_confirmed",
    re: /\bpayment timing:\s*to be confirmed\b/i,
    label: "Payment timing",
    question: "When are invoices due and how are phase payments triggered?",
    whyItMatters: "Invoice timing affects cash flow and milestone enforcement.",
    suggestedAnswerFormat: "e.g. Net 30; 50% on kickoff, 50% on go-live",
    affectsSections: ["Payment", "Invoicing"],
  },
  {
    id: "as_specified_in_schedule_a",
    re: /\bas specified in schedule a\b/i,
    label: "Schedule A details",
    question: "What phase, payment, and support terms belong in Schedule A?",
    whyItMatters: "Schedule A is referenced but not filled in — confirm phase amounts and support level.",
    suggestedAnswerFormat: "e.g. build/rollout/support split with dates",
    affectsSections: ["Schedule A"],
  },
];

const HEADING_ONLY_LINE_RE = /^\s*(\d+(?:\.\d+)*)\s+([A-Za-z][^.!?]{2,72})\.\s*$/;

function isHeadingOnlySection(lines: string[], index: number): MaterialMissingItem | null {
  const line = lines[index].trim();
  const m = line.match(HEADING_ONLY_LINE_RE);
  if (!m) return null;
  const title = m[2].trim();
  let j = index + 1;
  while (j < lines.length && !lines[j].trim()) j += 1;
  if (j >= lines.length) {
    return emptyHeadingItem(title);
  }
  const next = lines[j].trim();
  if (HEADING_ONLY_LINE_RE.test(next) || /^\s*\d+\.\s+[A-Z]/.test(next)) {
    return emptyHeadingItem(title);
  }
  const bodyLen = next.replace(HEADING_ONLY_LINE_RE, "").trim().length;
  if (bodyLen < 40) return emptyHeadingItem(title);
  return null;
}

function emptyHeadingItem(title: string): MaterialMissingItem {
  const id = `empty_heading_${title.toLowerCase().replace(/\W+/g, "_").slice(0, 40)}`;
  return {
    id,
    severity: "material",
    label: title,
    question: `What terms should appear under "${title}"?`,
    whyItMatters: "Empty clause headings undermine review confidence and leave gaps at signing.",
    suggestedAnswerFormat: "Short commercial paragraph for this section",
    affectsSections: [title],
    canProceedWithoutAnswer: true,
    agreementFamily: "generic_business_agreement",
  };
}

export function scanBodyMaterialPlaceholders(
  body: string,
  family: CommercialFamilyHint = "generic_business_agreement",
): MaterialMissingItem[] {
  const text = (body || "").trim();
  if (!text) return [];
  const items: MaterialMissingItem[] = [];
  const seen = new Set<string>();

  for (const rule of BODY_PLACEHOLDER_RULES) {
    if (!rule.re.test(text) || seen.has(rule.id)) continue;
    seen.add(rule.id);
    items.push({
      id: rule.id,
      severity: "material",
      agreementFamily: family,
      label: rule.label,
      question: rule.question,
      whyItMatters: rule.whyItMatters,
      suggestedAnswerFormat: rule.suggestedAnswerFormat,
      affectsSections: rule.affectsSections,
      canProceedWithoutAnswer: false,
    });
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const hit = isHeadingOnlySection(lines, i);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    items.push({ ...hit, agreementFamily: family });
  }

  return items;
}

export function bodyHasLoosePhaseScheduleBeforeSignatures(body: string): boolean {
  const t = (body || "").trim();
  if (!t) return false;
  const sigIdx = t.search(/\b(?:IN WITNESS|EXECUTION|SIGNATURES?)\b/i);
  const pre = sigIdx >= 0 ? t.slice(0, sigIdx) : t;
  if (/\n\s*SCHEDULE\s+A\s*(?:[-—]|—\s*Phase|\n)/i.test(pre)) return false;
  return (
    /\bPhase\s+\d+\s*[-–—:]/i.test(pre) ||
    /\n\s*\d+\.\s+(?:Build|Rollout|Migration|Support|Onboarding)\b/i.test(pre)
  );
}
