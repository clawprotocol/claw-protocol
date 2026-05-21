/**
 * Deterministic guided-question copy — no LLM for scaffolding, reasons, or previews.
 */

import type { DealVariable } from "./types";
import type { GuidedCompletionSession } from "./types";
import { resolveRecommendReasonForPill } from "./guidedRevisionAnchors";
import { resolveImplementationPreview } from "./guidedImplementationPreview";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";

export type GuidedQuestionOptionConfig = {
  recommendationReason?: string;
  implementationPreview?: string;
  recommendationRank?: number;
};

export type GuidedQuestionConfig = {
  id: string;
  whyThisMatters?: string;
  targetSectionLabel: string;
  bulkApplyChecklistLabel: string;
  finalAppliedAreaLabel: string;
  optionOverrides?: Record<string, GuidedQuestionOptionConfig>;
};

const FEES: GuidedQuestionConfig = {
  id: "fees",
  whyThisMatters: "Clear fee and payment timing prevents disputes when work starts or invoices go out.",
  targetSectionLabel: "Fees & Payment",
  bulkApplyChecklistLabel: "Fees & payment structure",
  finalAppliedAreaLabel: "Fees & Payment",
  optionOverrides: {
    monthly: {
      recommendationReason:
        "Your intake mentioned a recurring monthly payment but the draft does not spell out timing and invoicing.",
      implementationPreview:
        "Add monthly fee language, invoice timing, and late-payment protections to Section 2 — Fees and Payment.",
      recommendationRank: 1,
    },
    intake_estimate: {
      recommendationReason:
        "Your intake includes a fee figure that should be reflected consistently in the agreement.",
      implementationPreview:
        "Confirm total fee, payment schedule, and invoicing terms in Section 2 and Schedule A if needed.",
      recommendationRank: 1,
    },
  },
};

const GUIDED_BY_VARIABLE_ID: Record<string, GuidedQuestionConfig> = {
  payment_timing: FEES,
  payment_structure: FEES,
  total_fee_confirmation: FEES,
  project_fee_phase_confirmation: FEES,
  phase_payment_allocation: FEES,
  supplemental_schedule_confirmation: FEES,
  ip_ownership: {
    id: "ip",
    whyThisMatters: "Ownership of deliverables and background IP should match how you described the build.",
    targetSectionLabel: "Ownership & Work Product",
    bulkApplyChecklistLabel: "Ownership language",
    finalAppliedAreaLabel: "Ownership",
    optionOverrides: {
      client: {
        recommendationReason:
          "Your intake describes work product the client should own after delivery.",
        implementationPreview:
          "State client ownership of deliverables and license-back for provider tools in Section 4.",
        recommendationRank: 1,
      },
      provider: {
        implementationPreview:
          "State provider retention of core IP with a license grant to the client in Section 4.",
        recommendationRank: 2,
      },
    },
  },
  ip_allocation: {
    id: "ip",
    whyThisMatters: "Ownership of deliverables and background IP should match how you described the build.",
    targetSectionLabel: "Ownership & Work Product",
    bulkApplyChecklistLabel: "Ownership language",
    finalAppliedAreaLabel: "Ownership",
  },
  ip_ownership_contradiction: {
    id: "ip",
    targetSectionLabel: "Ownership & Work Product",
    bulkApplyChecklistLabel: "Ownership language",
    finalAppliedAreaLabel: "Ownership",
  },
  saas_sla: {
    id: "sla",
    whyThisMatters: "Support and uptime expectations should be measurable so both sides know what “done” looks like.",
    targetSectionLabel: "Support & SLA",
    bulkApplyChecklistLabel: "Support expectations",
    finalAppliedAreaLabel: "Support & SLA",
    optionOverrides: {
      business_hours: {
        recommendationReason:
          "Your intake mentions support but not business-hours coverage or response targets.",
        implementationPreview:
          "Add business-hours support, response targets, and escalation path in Section 5.",
        recommendationRank: 1,
      },
    },
  },
  support_obligations: {
    id: "sla",
    whyThisMatters: "Post-launch support should be explicit so scope does not drift after go-live.",
    targetSectionLabel: "Support & SLA",
    bulkApplyChecklistLabel: "SLA provisions",
    finalAppliedAreaLabel: "Support & SLA",
  },
  security_obligations: {
    id: "confidentiality",
    whyThisMatters: "Practical confidentiality duties protect both sides when sharing systems and data.",
    targetSectionLabel: "Confidentiality",
    bulkApplyChecklistLabel: "Confidentiality duties",
    finalAppliedAreaLabel: "Confidentiality",
  },
  nda_survival: {
    id: "confidentiality",
    targetSectionLabel: "Confidentiality",
    bulkApplyChecklistLabel: "Confidentiality duties",
    finalAppliedAreaLabel: "Confidentiality",
  },
  renewal_notice: {
    id: "termination",
    whyThisMatters: "Notice and exit terms should match how long you expect the relationship to run.",
    targetSectionLabel: "Termination",
    bulkApplyChecklistLabel: "Termination protections",
    finalAppliedAreaLabel: "Termination",
  },
  deal_terms_confirmation: {
    id: "general",
    targetSectionLabel: "General terms",
    bulkApplyChecklistLabel: "Remaining deal terms",
    finalAppliedAreaLabel: "General terms",
  },
};

function configForVariable(variableId: string): GuidedQuestionConfig {
  const direct = GUIDED_BY_VARIABLE_ID[variableId];
  if (direct) return direct;
  const target = resolveGuidedQuestionTarget(variableId);
  const section = target.sectionLabel;
  if (/fee|payment|phase/i.test(variableId)) return { ...FEES, id: variableId };
  if (/ip|ownership/i.test(variableId)) {
    return {
      id: variableId,
      targetSectionLabel: section,
      bulkApplyChecklistLabel: "Ownership language",
      finalAppliedAreaLabel: "Ownership",
    };
  }
  if (/sla|support/i.test(variableId)) {
    return {
      id: variableId,
      targetSectionLabel: section,
      bulkApplyChecklistLabel: "Support expectations",
      finalAppliedAreaLabel: "Support & SLA",
    };
  }
  if (/confidential|security|nda/i.test(variableId)) {
    return {
      id: variableId,
      targetSectionLabel: section,
      bulkApplyChecklistLabel: "Confidentiality duties",
      finalAppliedAreaLabel: "Confidentiality",
    };
  }
  if (/terminat|renewal/i.test(variableId)) {
    return {
      id: variableId,
      targetSectionLabel: section,
      bulkApplyChecklistLabel: "Termination protections",
      finalAppliedAreaLabel: "Termination",
    };
  }
  return {
    id: variableId,
    targetSectionLabel: section,
    bulkApplyChecklistLabel: section,
    finalAppliedAreaLabel: section,
  };
}

export function resolveGuidedQuestionConfig(variableId: string): GuidedQuestionConfig {
  return configForVariable(variableId);
}

export function normalizeWhyText(text: string | null | undefined): string | null {
  const t = (text || "").trim();
  if (!t) return null;
  return t.replace(/^Recommended because\s*/i, "").replace(/^Why:\s*/i, "");
}

export function resolveOptionDisplayCopy(args: {
  variableId: string;
  pillId: string;
  pillLabel: string;
  pillValue: string;
  intakeRaw?: string | null;
  variable?: DealVariable | null;
  instructionAnswer?: string;
}): {
  why: string | null;
  lawDogWill: string;
  recommended: boolean;
} {
  const cfg = configForVariable(args.variableId);
  const override = cfg.optionOverrides?.[args.pillId];
  const intakeReason = resolveRecommendReasonForPill(args.variableId, args.pillId, args.intakeRaw);
  const why =
    normalizeWhyText(override?.recommendationReason) ||
    normalizeWhyText(intakeReason) ||
    (args.pillId === args.variable?.recommendedPillId
      ? normalizeWhyText(args.variable?.recommendedLabel)
      : null);
  const lawDogWill =
    override?.implementationPreview?.trim() ||
    resolveImplementationPreview(args.variableId, args.pillLabel, args.instructionAnswer ?? args.pillValue);
  const recommended =
    args.pillId === args.variable?.recommendedPillId ||
    override?.recommendationRank === 1 ||
    Boolean(why && args.pillId !== "custom");
  return { why, lawDogWill, recommended };
}

export type BulkChecklistItem = { variableId: string; label: string; answered: boolean };

export function buildBulkApplyChecklist(session: GuidedCompletionSession): BulkChecklistItem[] {
  const seen = new Set<string>();
  const items: BulkChecklistItem[] = [];
  for (const id of session.queue) {
    const cfg = configForVariable(id);
    const key = cfg.finalAppliedAreaLabel;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      variableId: id,
      label: cfg.bulkApplyChecklistLabel,
      answered: Boolean((session.answered[id] || "").trim()),
    });
  }
  return items;
}

export function buildFinalAppliedAreaLabels(session: GuidedCompletionSession): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const id of session.queue) {
    if (!(session.answered[id] || "").trim()) continue;
    const label = configForVariable(id).finalAppliedAreaLabel;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function resolveQuestionNumber(session: GuidedCompletionSession, variableId: string): number {
  const idx = session.queue.indexOf(variableId);
  return idx >= 0 ? idx + 1 : 1;
}
