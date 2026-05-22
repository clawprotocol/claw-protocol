/**
 * Final-review applied-summary checklist from committed guided answer metadata (not DOM markers).
 */

import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";

export const GUIDED_APPLIED_CHECKLIST_ORDER = [
  "Fees & Payment",
  "Support & SLA",
  "Ownership",
  "Termination / Renewal",
  "Invoice timing & renewal",
] as const;

/** Heading text fallbacks when mutation markers are absent (scroll-by-text). */
export const GUIDED_CHECKLIST_SECTION_HEADING_FALLBACKS: Record<
  GuidedAppliedChecklistLabel,
  readonly string[]
> = {
  "Fees & Payment": ["Fees", "Payment", "Compensation", "Fee Schedule", "Pricing"],
  "Support & SLA": ["Support", "Service Level", "SLA", "Uptime"],
  Ownership: ["Intellectual Property", "Ownership", "Work Product", "IP"],
  "Termination / Renewal": ["Termination", "Renewal", "Term and Termination"],
  "Invoice timing & renewal": ["Payment Terms", "Invoicing", "Invoice", "Net 30"],
};

export type GuidedAppliedChecklistLabel = (typeof GUIDED_APPLIED_CHECKLIST_ORDER)[number];

const VARIABLE_TO_BUCKET: Record<string, GuidedAppliedChecklistLabel> = {
  payment_timing: "Invoice timing & renewal",
  payment_structure: "Fees & Payment",
  payment_timing_to_be_confirmed: "Invoice timing & renewal",
  total_fee_confirmation: "Fees & Payment",
  project_fee_phase_confirmation: "Fees & Payment",
  phase_payment_allocation: "Fees & Payment",
  supplemental_schedule_confirmation: "Fees & Payment",
  amount_to_be_confirmed: "Fees & Payment",
  saas_sla: "Support & SLA",
  support_obligations: "Support & SLA",
  ai_ops_economics: "Support & SLA",
  ip_ownership: "Ownership",
  ip_allocation: "Ownership",
  ip_ownership_contradiction: "Ownership",
  license_background_tools: "Ownership",
  license_scope: "Ownership",
  term_structure_contradiction: "Termination / Renewal",
  renewal_notice: "Invoice timing & renewal",
  governing_law_notice: "Termination / Renewal",
  governing_venue: "Termination / Renewal",
  security_obligations: "Termination / Renewal",
  deliverables_scope: "Fees & Payment",
  deal_terms_confirmation: "Fees & Payment",
};

function bucketForVariableId(variableId: string): GuidedAppliedChecklistLabel | null {
  const direct = VARIABLE_TO_BUCKET[variableId];
  if (direct) return direct;
  const cfg = resolveGuidedQuestionConfig(variableId);
  const area = (cfg.finalAppliedAreaLabel || "").trim();
  if (/fee|payment|compensation|schedule/i.test(area)) return "Fees & Payment";
  if (/support|sla|uptime/i.test(area)) return "Support & SLA";
  if (/ownership|ip|work product/i.test(area)) return "Ownership";
  if (/terminat|renew|notice|governing/i.test(area)) return "Termination / Renewal";
  if (/invoice|timing|net\s+\d/i.test(area)) return "Invoice timing & renewal";
  return null;
}

/** Compact checklist labels for Simple Pro Final Review (answered ids only). */
export function buildGuidedAppliedSummaryChecklist(
  answeredVariableIds: readonly string[],
): GuidedAppliedChecklistLabel[] {
  const present = new Set<GuidedAppliedChecklistLabel>();
  for (const id of answeredVariableIds) {
    if (!(id || "").trim()) continue;
    const bucket = bucketForVariableId(id);
    if (bucket) present.add(bucket);
  }
  return GUIDED_APPLIED_CHECKLIST_ORDER.filter((label) => present.has(label));
}
