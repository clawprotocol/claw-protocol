/**
 * Universal semantic contract completeness — detects unresolved business meaning
 * even when prose exists and literal placeholder scanners return zero hits.
 */

import type { CommercialFamilyHint, MaterialMissingItem, MaterialSeverity } from "../proAgreementCompleteness/types";
import { isConsultingDevIntake } from "./consultingGuidedIntake";
import { isContractorDeveloperIntake } from "./contractorGuidedIntake";
import { detectIpOwnershipContradiction } from "./detectContradictoryTerms";
import { isServicesMigrationIntake } from "./servicesMigrationGuidedIntake";

export type SemanticGapKind =
  | "commercial_ambiguity"
  | "empty_clause"
  | "schedule_reference"
  | "generic_fallback"
  | "duplicate_contamination"
  | "operational_fee"
  | "operational_payment"
  | "operational_deliverables"
  | "operational_support"
  | "operational_sla"
  | "operational_ip"
  | "operational_venue"
  | "operational_renewal"
  | "operational_phase"
  | "operational_security";

export type SemanticContractGap = {
  kind: SemanticGapKind;
  id: string;
  label: string;
  question: string;
  whyItMatters: string;
  suggestedAnswerFormat: string;
  affectsSections: string[];
  severity: MaterialSeverity;
  evidence?: string;
};

const COMMERCIAL_AMBIGUITY_RES: readonly { re: RegExp; id: string; label: string }[] = [
  { re: /\bto be confirmed\b/i, id: "supplemental_schedule_confirmation", label: "Confirmation deferred" },
  { re: /\bto be finalized\b/i, id: "writing_before_execution", label: "Terms to be finalized" },
  { re: /\bsubject to (?:written )?confirmation\b/i, id: "writing_before_execution", label: "Written confirmation required" },
  { re: /\bfees? will be confirmed\b/i, id: "total_fee_confirmation", label: "Fee confirmation" },
  { re: /\bwill be agreed\b/i, id: "payment_structure", label: "Payment to be agreed" },
  { re: /\bunless otherwise agreed\b/i, id: "payment_structure", label: "Otherwise-agreed terms" },
  { re: /\bapproximately\b/i, id: "total_fee_confirmation", label: "Approximate fee" },
  { re: /\banticipated\b/i, id: "total_fee_confirmation", label: "Anticipated amount" },
  { re: /\bexpected\b/i, id: "total_fee_confirmation", label: "Expected amount" },
  { re: /\bmay include\b/i, id: "support_obligations", label: "Support scope open" },
  { re: /\bsupport may include\b/i, id: "support_obligations", label: "Support scope open" },
  { re: /\bcommercially reasonable credits?\b/i, id: "saas_sla", label: "SLA credits vague" },
  { re: /\bas applicable\b/i, id: "deal_terms_confirmation", label: "As-applicable terms" },
  { re: /\bas specified in schedule a\b/i, id: "as_specified_in_schedule_a", label: "Schedule A reference" },
  { re: /\bsee schedule a\b/i, id: "as_specified_in_schedule_a", label: "Schedule A reference" },
  { re: /\bamount:\s*to be confirmed\b/i, id: "amount_to_be_confirmed", label: "Amount open" },
  { re: /\bpayment timing:\s*to be confirmed\b/i, id: "payment_timing_to_be_confirmed", label: "Payment timing open" },
  { re: /\bto be confirmed in a supplemental schedule\b/i, id: "supplemental_schedule_confirmation", label: "Supplemental schedule" },
  { re: /\bto be confirmed in writing\b/i, id: "writing_before_execution", label: "Written confirmation" },
  { re: /\bmutually agreed\b/i, id: "payment_structure", label: "Mutually agreed terms" },
  { re: /\bto be agreed\b/i, id: "payment_structure", label: "To be agreed" },
  { re: /\bwill be confirmed\b/i, id: "writing_before_execution", label: "Will be confirmed" },
  { re: /\bmaybe\b/i, id: "total_fee_confirmation", label: "Uncertain fee (maybe)" },
  { re: /\b\?\?\?\b/, id: "phase_payment_allocation", label: "Unresolved phase value" },
  { re: /\b(?:build|rollout|support)\b[^\n]{0,40}\bTBD\b/i, id: "phase_payment_allocation", label: "Phase TBD" },
  { re: /\bsupport details to be confirmed\b/i, id: "support_obligations", label: "Support TBD" },
  { re: /\bpossible total\b/i, id: "total_fee_confirmation", label: "Possible total fee" },
  { re: /\bas set forth in schedule a\b/i, id: "as_specified_in_schedule_a", label: "Schedule A reference" },
];

const GENERIC_FALLBACK_SNIPPETS: readonly RegExp[] = [
  /\bfees and payment timing will be confirmed in writing\b/i,
  /\bcommercially reasonable efforts\b/i,
  /\bthe parties will cooperate in good faith\b/i,
  /\bspecific compensation mechanics will be completed in schedule a\b/i,
  /\bfees are invoiced per schedule a\b/i,
  /\bservice availability and response targets will be as stated\b/i,
  /\beach party will indemnify the other for third-party claims\b/i,
  /\beach party may disclose confidential information\b/i,
];

const HEADING_ONLY_RE = /^\s*(\d+(?:\.\d+)*)\s+([A-Za-z][^.!?]{2,80})\.\s*$/;
const SUBSTANTIVE_MIN = 48;

const GAP_TEMPLATES: Record<
  string,
  Omit<SemanticContractGap, "kind" | "evidence"> & { kind: SemanticGapKind }
> = {
  supplemental_schedule_confirmation: {
    kind: "schedule_reference",
    id: "supplemental_schedule_confirmation",
    label: "Schedule / supplemental terms",
    question: "What should go in the supplemental schedule (fees, phases, support)?",
    whyItMatters: "Commercial terms are deferred to a schedule that is not finalized.",
    suggestedAnswerFormat: "e.g. $120k split across build, rollout, support",
    affectsSections: ["Schedule A", "Compensation"],
    severity: "material",
  },
  total_fee_confirmation: {
    kind: "operational_fee",
    id: "total_fee_confirmation",
    label: "Total fee",
    question: "What is the total contract fee and currency?",
    whyItMatters: "Fee amount is vague or deferred.",
    suggestedAnswerFormat: "e.g. $120,000 USD",
    affectsSections: ["Compensation", "Fees"],
    severity: "material",
  },
  phase_payment_allocation: {
    kind: "operational_phase",
    id: "phase_payment_allocation",
    label: "Phase payment allocation",
    question: "How should fees split across build, rollout, and support phases?",
    whyItMatters: "Phase economics are not operationally defined.",
    suggestedAnswerFormat: "e.g. 40% build, 40% rollout, 20% support",
    affectsSections: ["Schedule A", "Milestones"],
    severity: "material",
  },
  payment_timing: {
    kind: "operational_payment",
    id: "payment_timing",
    label: "Invoice timing",
    question: "When are invoices due and what triggers each payment?",
    whyItMatters: "Payment cadence must be explicit.",
    suggestedAnswerFormat: "e.g. Net 30; due on phase acceptance",
    affectsSections: ["Payment", "Invoicing"],
    severity: "material",
  },
  payment_structure: {
    kind: "operational_payment",
    id: "payment_structure",
    label: "Payment structure",
    question: "How should fees be structured and invoiced?",
    whyItMatters: "Payment mechanics are still open.",
    suggestedAnswerFormat: "e.g. milestone-based, monthly retainer",
    affectsSections: ["Compensation", "Payment"],
    severity: "material",
  },
  support_obligations: {
    kind: "operational_support",
    id: "support_obligations",
    label: "Support scope",
    question: "What support should be included after delivery or go-live?",
    whyItMatters: "Support obligations are vague or optional-sounding.",
    suggestedAnswerFormat: "e.g. business-hours support for 90 days",
    affectsSections: ["Support", "Services"],
    severity: "material",
  },
  saas_sla: {
    kind: "operational_sla",
    id: "saas_sla",
    label: "Support / SLA level",
    question: "What uptime, response times, and SLA remedies apply?",
    whyItMatters: "SLA metrics or credits are not concrete.",
    suggestedAnswerFormat: "e.g. 99.5% uptime; 4h critical response",
    affectsSections: ["SLA", "Service Levels"],
    severity: "material",
  },
  ip_ownership: {
    kind: "operational_ip",
    id: "ip_ownership",
    label: "IP / deliverables ownership",
    question: "Who owns deliverables and custom work product?",
    whyItMatters: "Ownership allocation is not operationally clear.",
    suggestedAnswerFormat: "e.g. Client owns deliverables",
    affectsSections: ["Intellectual Property"],
    severity: "material",
  },
  governing_law_notice: {
    kind: "operational_venue",
    id: "governing_law_notice",
    label: "Governing law / venue",
    question: "Which state's law and venue govern disputes?",
    whyItMatters: "Forum selection affects enforceability.",
    suggestedAnswerFormat: "e.g. Texas law; courts in Travis County",
    affectsSections: ["Governing Law", "Venue"],
    severity: "material",
  },
  governing_venue: {
    kind: "operational_venue",
    id: "governing_venue",
    label: "Venue",
    question: "What courts or forum will hear disputes?",
    whyItMatters: "Venue heading exists without operational terms.",
    suggestedAnswerFormat: "e.g. state courts where Client is headquartered",
    affectsSections: ["Venue", "Dispute Resolution"],
    severity: "material",
  },
  renewal_notice: {
    kind: "operational_renewal",
    id: "renewal_notice",
    label: "Renewal / termination notice",
    question: "How does renewal work and how much notice is required?",
    whyItMatters: "Renewal mechanics are not defined.",
    suggestedAnswerFormat: "e.g. 30 days notice to terminate",
    affectsSections: ["Term", "Renewal"],
    severity: "material",
  },
  deliverables_scope: {
    kind: "operational_deliverables",
    id: "deliverables_scope",
    label: "Deliverables",
    question: "What will be delivered under this agreement?",
    whyItMatters: "Deliverables section lacks operational detail.",
    suggestedAnswerFormat: "e.g. migration, dashboards, onboarding",
    affectsSections: ["Deliverables", "Scope"],
    severity: "material",
  },
  security_obligations: {
    kind: "operational_security",
    id: "security_obligations",
    label: "Security obligations",
    question: "What security and data-protection obligations apply?",
    whyItMatters: "Security section is generic or empty.",
    suggestedAnswerFormat: "e.g. encryption; breach notice within 72 hours",
    affectsSections: ["Security"],
    severity: "material",
  },
  as_specified_in_schedule_a: {
    kind: "schedule_reference",
    id: "as_specified_in_schedule_a",
    label: "Schedule A details",
    question: "What commercial terms belong in Schedule A?",
    whyItMatters: "Schedule A is referenced without finalized allocations.",
    suggestedAnswerFormat: "Phase fees, support level, payment triggers",
    affectsSections: ["Schedule A"],
    severity: "material",
  },
  deal_terms_confirmation: {
    kind: "commercial_ambiguity",
    id: "deal_terms_confirmation",
    label: "Confirm remaining deal terms",
    question: "Which deal terms should LawDog lock before signature?",
    whyItMatters: "The draft still contains unresolved business language.",
    suggestedAnswerFormat: "Specific fee, SLA, ownership, or venue term",
    affectsSections: ["General"],
    severity: "material",
  },
  project_fee_phase_confirmation: {
    kind: "operational_phase",
    id: "project_fee_phase_confirmation",
    label: "Project fee and phases",
    question: "Confirm the total project fee and how it splits across build, rollout, and support phases.",
    whyItMatters: "Fee and phase economics are still open — confirm before execution.",
    suggestedAnswerFormat: "e.g. $120,000 total: 40% build, 40% rollout, 20% support",
    affectsSections: ["Compensation", "Schedule A", "Milestones"],
    severity: "material",
  },
};

function templateForId(id: string, title?: string): SemanticContractGap {
  const base = GAP_TEMPLATES[id] ?? GAP_TEMPLATES.deal_terms_confirmation;
  if (id.startsWith("empty_heading_") && title) {
    return {
      kind: "empty_clause",
      id,
      label: title,
      question: `What terms should appear under "${title}"?`,
      whyItMatters: "This section heading has no substantive operational paragraph.",
      suggestedAnswerFormat: "Short commercial paragraph for this section",
      affectsSections: [title],
      severity: "material",
    };
  }
  return { ...base };
}

function normalizeParagraph(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

export function detectDuplicateParagraphContamination(body: string): SemanticContractGap[] {
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  const consider = (p: string) => {
    if (p.length < 50) return;
    const key = normalizeParagraph(p);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 2 && /indemnif|confidential|commercially reasonable/i.test(p)) {
      dupes.push(key.slice(0, 80));
    }
  };
  for (const p of body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((x) => x.trim())) {
    consider(p);
  }
  for (const line of body.replace(/\r\n/g, "\n").split("\n").map((x) => x.trim())) {
    consider(line);
  }
  if (!dupes.length) return [];
  return [
    {
      kind: "duplicate_contamination",
      id: "duplicate_boilerplate_cleanup",
      label: "Repeated boilerplate",
      question: "Should we consolidate repeated indemnity, confidentiality, or fallback paragraphs?",
      whyItMatters: "Duplicate paragraphs suggest incomplete drafting and confuse reviewers.",
      suggestedAnswerFormat: "Keep one operative paragraph per topic",
      affectsSections: ["Indemnity", "Confidentiality"],
      severity: "recommended",
      evidence: dupes[0],
    },
  ];
}

function detectEmptyClauseHeadings(body: string): SemanticContractGap[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: SemanticContractGap[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const m = line.match(HEADING_ONLY_RE);
    if (!m) continue;
    const title = m[2].trim();
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j >= lines.length) {
      const id = `empty_heading_${title.toLowerCase().replace(/\W+/g, "_").slice(0, 36)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(templateForId(id, title));
      continue;
    }
    const next = lines[j].trim();
    if (HEADING_ONLY_RE.test(next) || /^\s*\d+\.\s+[A-Z]/.test(next)) {
      const id = `empty_heading_${title.toLowerCase().replace(/\W+/g, "_").slice(0, 36)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(templateForId(id, title));
      continue;
    }
    const bodyText = next.replace(HEADING_ONLY_RE, "").trim();
    const isGenericOnly = GENERIC_FALLBACK_SNIPPETS.some((re) => re.test(bodyText));
    if (bodyText.length < SUBSTANTIVE_MIN || isGenericOnly) {
      const id = `empty_heading_${title.toLowerCase().replace(/\W+/g, "_").slice(0, 36)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(templateForId(id, title));
    }
  }
  return out;
}

function detectOperationalIncompleteness(
  body: string,
  intake: string,
  family: CommercialFamilyHint,
): SemanticContractGap[] {
  const low = body.toLowerCase();
  const intakeLow = intake.toLowerCase();
  const out: SemanticContractGap[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(templateForId(id));
  };

  const servicesLike =
    isServicesMigrationIntake(intake, body) ||
    isConsultingDevIntake(intake, body) ||
    family === "saas_msa" ||
    family === "services_agreement" ||
    family === "consulting_agreement";

  if (
    !detectIpOwnershipContradiction(intake) &&
    !/\$\s*[\d,]{2,}/.test(low) &&
    (/\b(?:fee|compensation|amount|pricing)\b/i.test(low) || /\$\s*[\d,]+/i.test(intake))
  ) {
    add("total_fee_confirmation");
  }
  if (
    (/\bphase\s+\d+\b/i.test(low) || /\b(?:build|rollout|support)\s+phase\b/i.test(low)) &&
    !/\b\d+\s*%|\$\s*[\d,]+/i.test(low.slice(low.search(/phase/i)))
  ) {
    add("phase_payment_allocation");
  }
  if (!/\bnet\s+\d+\b/i.test(low) && /\b(?:invoice|payment|fee)\b/i.test(low)) {
    add("payment_timing");
  }
  if (
    (/\b(?:support|sla|uptime)\b/i.test(intakeLow) || /\b(?:support|sla)\b/i.test(low)) &&
    !/\b\d+\s*%|\b\d+\s*(?:hour|business day)/i.test(low)
  ) {
    add("saas_sla");
  }
  if (/\b(?:deliverable|scope of work|services include)\b/i.test(intakeLow) && !/\bwill deliver|shall deliver|deliverables include\b/i.test(low)) {
    add("deliverables_scope");
  }
  if (
    (/\b(?:ip|work product|ownership)\b/i.test(intakeLow) || servicesLike) &&
    !/\b(?:assign|owns|ownership of)\b[\s\S]{0,100}\b(?:deliverable|work product)/i.test(low)
  ) {
    add("ip_ownership");
  }
  if (/\bvenue\b/i.test(low) && !/\b(?:courts?|county|district|arbitration|forum)\b/i.test(low)) {
    add("governing_venue");
  }
  if (!/\blaws of the state of\b/i.test(low) && /\b(?:governing law|jurisdiction|venue)\b/i.test(intakeLow + low)) {
    add("governing_law_notice");
  }
  if (/\b(?:renew|auto[-\s]?renew|month[-\s]?to[-\s]?month)\b/i.test(intakeLow) && !/\b\d+\s+days?\b/i.test(low)) {
    add("renewal_notice");
  }
  if (/\b(?:security|cyber|data protection)\b/i.test(intakeLow) && !/\b(?:encrypt|breach|soc|incident)\b/i.test(low)) {
    add("security_obligations");
  }
  if (isContractorDeveloperIntake(intake) && !seen.has("ip_ownership")) {
    add("ip_ownership");
  }

  return out;
}

function hasIncompleteScheduleAReference(body: string): boolean {
  if (!/\b(?:as set forth in|see|per)\s+schedule\s+a\b/i.test(body)) return false;
  return !/\n\s*SCHEDULE\s+A\s*(?:[-—]|—\s*Phase|\n)/i.test(body);
}

/** Pasted intake tables with TBD / ??? in phase rows. */
export function detectIntakePhaseTableGaps(intakeRaw?: string | null): SemanticContractGap[] {
  const intake = (intakeRaw || "").trim();
  if (!intake) return [];
  const hasTable =
    /\|[^\n]*\|/.test(intake) ||
    (/\b(?:build|rollout|support)\b/i.test(intake) && /\b(?:TBD|\?\?\?)\b/i.test(intake));
  if (!hasTable) return [];
  const out: SemanticContractGap[] = [];
  if (/\b(?:TBD|\?\?\?|maybe)\b/i.test(intake)) {
    out.push(templateForId("project_fee_phase_confirmation"));
  }
  return out;
}

export function detectSemanticContractGaps(args: {
  body: string;
  intakeRaw?: string | null;
  agreementFamily?: CommercialFamilyHint;
}): SemanticContractGap[] {
  const body = (args.body || "").trim();
  if (!body) return [];
  const intake = (args.intakeRaw || "").trim();
  const family = args.agreementFamily ?? "generic_business_agreement";
  const seen = new Set<string>();
  const out: SemanticContractGap[] = [];

  const push = (gap: SemanticContractGap) => {
    if (seen.has(gap.id)) return;
    seen.add(gap.id);
    out.push(gap);
  };

  for (const { re, id } of COMMERCIAL_AMBIGUITY_RES) {
    if (re.test(body)) push(templateForId(id));
  }

  for (const gap of detectEmptyClauseHeadings(body)) push(gap);
  for (const gap of detectDuplicateParagraphContamination(body)) push(gap);
  for (const gap of detectOperationalIncompleteness(body, intake, family)) push(gap);
  for (const gap of detectIntakePhaseTableGaps(intake)) push(gap);

  if (hasIncompleteScheduleAReference(body) && !seen.has("as_specified_in_schedule_a")) {
    push(templateForId("as_specified_in_schedule_a"));
  }

  if (
    isServicesMigrationIntake(intake, body) &&
    (/\b(?:maybe|approximately|about)\b/i.test(intake) || /\bto be confirmed\b/i.test(body)) &&
    !seen.has("project_fee_phase_confirmation")
  ) {
    push(templateForId("project_fee_phase_confirmation"));
  }

  const genericHits = GENERIC_FALLBACK_SNIPPETS.filter((re) => re.test(body)).length;
  if (genericHits >= 3 && !seen.has("deal_terms_confirmation")) {
    push(templateForId("deal_terms_confirmation"));
  }

  return out;
}

export function semanticGapsToMaterialItems(
  gaps: readonly SemanticContractGap[],
  family: CommercialFamilyHint,
): MaterialMissingItem[] {
  return gaps.map((g) => ({
    id: g.id,
    severity: g.severity,
    agreementFamily: family,
    label: g.label,
    question: g.question,
    whyItMatters: g.whyItMatters,
    suggestedAnswerFormat: g.suggestedAnswerFormat,
    affectsSections: g.affectsSections,
    canProceedWithoutAnswer: g.severity !== "critical",
  }));
}

/** Score for “semantically incomplete but legally shaped” documents. */
export function computeSemanticIncompleteScore(body: string, intakeRaw?: string | null): number {
  const gaps = detectSemanticContractGaps({ body, intakeRaw });
  let score = gaps.length * 12;
  if (/\bto be confirmed\b/i.test(body)) score += 25;
  if (/\bschedule a\b/i.test(body) && !/\bschedule a\s*[-—]\s*phase/i.test(body)) score += 15;
  const genericHits = GENERIC_FALLBACK_SNIPPETS.filter((re) => re.test(body)).length;
  score += genericHits * 8;
  return Math.min(100, score);
}

export function semanticGapScanLines(body: string, max = 5): string[] {
  const gaps = detectSemanticContractGaps({ body });
  return gaps.slice(0, max).map((g) => `Unresolved: ${g.label}`);
}

export function hasSemanticMaterialGaps(body: string, intakeRaw?: string | null): boolean {
  return detectSemanticContractGaps({ body, intakeRaw }).length > 0 || computeSemanticIncompleteScore(body, intakeRaw) >= 20;
}
