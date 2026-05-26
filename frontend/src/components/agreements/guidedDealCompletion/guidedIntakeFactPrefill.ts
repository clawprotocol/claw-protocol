/**
 * Deterministic guided Q&A intake fact extraction, pre-answers, and contradiction guards.
 */

import type { DealVariable, DealVariableDefault } from "./types";

function parseGoverningLawFromIntake(intake: string): string | null {
  const m =
    intake.match(/\b(?:laws?\s+of\s+(?:the\s+State\s+of\s+)?)(Delaware|Texas|Oklahoma|New York|California)\b/i) ??
    intake.match(/\bgoverning\s+law\s*:\s*(Delaware|Texas|Oklahoma|New York|California)\b/i) ??
    intake.match(/\b(Delaware|Texas|Oklahoma|New York|California)\s+law\b/i);
  return m ? m[1] : null;
}

export type GuidedIntakeFacts = {
  totalProjectFee: string | null;
  milestoneSplit403030: boolean;
  monthlySupportFee: string | null;
  paymentMode: "milestone_project" | "monthly_retainer" | "hybrid" | "unknown";
  terminationDays: number | null;
  governingLaw: string | null;
  noticesByEmail: boolean;
  noThirdPartyUptimeGuarantee: boolean;
  ownershipClient: boolean;
  confidentialityRequested: boolean;
  providerRetainsBackgroundTools: boolean;
  phaseAllocationText: string | null;
  paymentStructureText: string | null;
};

const INTAKE_403030_RE =
  /40\s*%[\s\S]{0,80}30\s*%[\s\S]{0,80}30\s*%|40\s*\/\s*30\s*\/\s*30|forty.{0,24}thirty.{0,24}thirty/i;

const NO_UPTIME_GUARANTEE_RE =
  /\bno\s+(?:guaranteed?|guarantee)\s+(?:uptime|availability|sla)\b|\b(?:do\s+not|don't|without)\s+(?:guarantee|guaranteeing)\s+.{0,40}(?:third[-\s]?party|ai\s+platform|platform)\b|\bthird[-\s]?party\s+ai\s+platforms?\s+.{0,40}(?:no|without)\s+guarantee/i;

export function parseGuidedIntakeFacts(intakeRaw = ""): GuidedIntakeFacts {
  const intake = (intakeRaw || "").replace(/\s+/g, " ").trim();
  const milestoneSplit403030 = INTAKE_403030_RE.test(intake);
  const totalMatch =
    intake.match(/\$[\d,]+(?:\.\d{2})?\s*(?:total|fixed|project\s+fee)?/i) ??
    intake.match(/\$[\d,]+(?:\.\d{2})?/i);
  const monthlySupport =
    intake.match(/\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month[^.]{0,40}(?:support|optional)?/i) ??
    intake.match(/optional[^.]{0,40}\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month/i);
  const monthlyCore = /\$[\d,]+(?:\.\d{2})?\s*(?:\/|\s+per\s+)?month|month[-\s]?to[-\s]?month|monthly\s+retainer/i.test(
    intake,
  );
  const milestoneCore =
    milestoneSplit403030 ||
    /\bmilestone|phase\s+allocation|schedule\s+a|across\s+build\b/i.test(intake) ||
    /\$[\d,]+(?:\.\d{2})?\s+total/i.test(intake);

  let paymentMode: GuidedIntakeFacts["paymentMode"] = "unknown";
  if (milestoneSplit403030 || (milestoneCore && /\$[\d,]+(?:\.\d{2})?\s+total/i.test(intake))) {
    paymentMode = "milestone_project";
  } else if (monthlyCore && milestoneCore) paymentMode = "hybrid";
  else if (monthlyCore && !milestoneCore) paymentMode = "monthly_retainer";
  else if (milestoneCore) paymentMode = "milestone_project";

  const terminationMatch = intake.match(/\b(\d{1,3})\s*-?\s*days?\b/i);
  const terminationDays =
    terminationMatch?.[1] != null
      ? Number(terminationMatch[1])
      : /\bthirty\b/i.test(intake)
        ? 30
        : /\bfifteen\b/i.test(intake)
          ? 15
          : null;

  return {
    totalProjectFee: totalMatch ? totalMatch[0].replace(/\s+/g, " ").trim() : null,
    milestoneSplit403030,
    monthlySupportFee: monthlySupport ? monthlySupport[0].replace(/\s+/g, " ").trim() : null,
    paymentMode,
    terminationDays,
    governingLaw: parseGoverningLawFromIntake(intake),
    noticesByEmail: /\bnotices?\s+by\s+email|email\s+notices?\b/i.test(intake),
    noThirdPartyUptimeGuarantee: NO_UPTIME_GUARANTEE_RE.test(intake),
    ownershipClient:
      /\b(?:company|client)\s+owns?\b/i.test(intake) ||
      /\bownership\s+of\s+what\s+gets\s+built\b/i.test(intake) ||
      /\bownership\s+after\s+payment\b/i.test(intake),
    confidentialityRequested: /\bconfidential(?:ity| information)?\b/i.test(intake),
    providerRetainsBackgroundTools:
      /\b(?:service provider|provider|consultant|contractor|vendor)\s+retains?.{0,80}(?:pre[-\s]?existing|background|tools?|templates?|know-how|methods?)\b/i.test(intake) ||
      /\b(?:pre[-\s]?existing|background)\s+(?:tools?|templates?|materials?|technology|know-how).{0,80}\b(?:retained|remain|provider|consultant|contractor|vendor)\b/i.test(intake),
    phaseAllocationText: milestoneSplit403030
      ? "40% build/configuration, 30% rollout/onboarding, 30% support/acceptance"
      : null,
    paymentStructureText: milestoneCore
      ? "Milestone-based payments tied to phase acceptance per Schedule A."
      : monthlyCore
        ? "Monthly service fee as stated in the intake."
        : null,
  };
}

export function deriveIntakePrefilledAnswers(facts: GuidedIntakeFacts): Record<string, string> {
  const out: Record<string, string> = {};
  if (facts.phaseAllocationText) {
    out.phase_payment_allocation = facts.phaseAllocationText;
  }
  if (facts.paymentStructureText) {
    out.payment_structure = facts.paymentStructureText;
  }
  if (facts.totalProjectFee) {
    out.project_fee_phase_confirmation = facts.totalProjectFee;
    out.total_fee_confirmation = facts.totalProjectFee;
  }
  if (facts.terminationDays != null) {
    out.renewal_notice = `${facts.terminationDays} days written notice`;
  }
  if (facts.governingLaw) {
    out.governing_law = facts.governingLaw;
    out.governing_law_notice = `Laws of the State of ${facts.governingLaw}`;
    out.governing_venue = `Laws of the State of ${facts.governingLaw}`;
  }
  if (facts.noticesByEmail) {
    out.notices_email = "Formal notices may be delivered by email to the addresses on file.";
  }
  if (facts.ownershipClient) {
    out.ip_ownership = "Company owns project deliverables";
  }
  if (facts.providerRetainsBackgroundTools) {
    out.license_background_tools = "Service Provider retains pre-existing tools, templates, know-how, and background materials.";
  }
  if (facts.confidentialityRequested) {
    out.security_obligations = "Mutual confidentiality with reasonable care for shared business and automation information.";
    out.nda_survival = "Confidentiality obligations survive termination.";
  }
  if (facts.noThirdPartyUptimeGuarantee) {
    out.saas_sla =
      "No guaranteed uptime for third-party AI platforms; commercially reasonable support only.";
    out.support_obligations =
      "Commercially reasonable support without uptime guarantees for third-party AI platforms.";
  }
  return out;
}

export function isGuidedVariableSatisfiedByIntake(variableId: string, intakeRaw = "", body = ""): boolean {
  const facts = parseGuidedIntakeFacts(`${intakeRaw}\n${body}`);
  const pre = deriveIntakePrefilledAnswers(facts);
  if (pre[variableId]) return true;

  switch (variableId) {
    case "phase_payment_allocation":
    case "supplemental_schedule_confirmation":
    case "as_specified_in_schedule_a":
    case "milestone_schedule":
      return facts.milestoneSplit403030 || facts.paymentMode === "milestone_project";
    case "payment_structure":
      return Boolean(facts.paymentStructureText) || facts.paymentMode !== "unknown";
    case "project_fee_phase_confirmation":
    case "total_fee_confirmation":
    case "amount_to_be_confirmed":
      return Boolean(facts.totalProjectFee);
    case "renewal_notice":
    case "termination":
      return facts.terminationDays != null;
    case "governing_law":
    case "governing_law_notice":
    case "governing_venue":
      return Boolean(facts.governingLaw);
    case "saas_sla":
    case "support_obligations":
      if (facts.noThirdPartyUptimeGuarantee) return true;
      return /\b(?:sla|uptime|support)\b/i.test(intakeRaw) && !NO_UPTIME_GUARANTEE_RE.test(intakeRaw);
    case "ip_ownership":
    case "ip_allocation":
      return facts.ownershipClient;
    case "license_background_tools":
      return facts.providerRetainsBackgroundTools;
    case "security_obligations":
    case "nda_survival":
      return facts.confidentialityRequested;
    case "payment_timing":
      return /\bnet\s*\d+\b/i.test(intakeRaw) || /\bon\s+receipt\b/i.test(intakeRaw);
    default:
      return false;
  }
}

export function filterContradictoryGuidedPills(
  variable: DealVariable,
  intakeRaw = "",
): DealVariableDefault[] {
  const facts = parseGuidedIntakeFacts(intakeRaw);
  return variable.suggestedDefaults.filter((pill) => {
    const blob = `${pill.id} ${pill.label} ${pill.value}`.toLowerCase();
    if (facts.milestoneSplit403030 && /even\s+thirds|even\s+split|one-third\s+each/.test(blob)) {
      return false;
    }
    if (facts.noThirdPartyUptimeGuarantee && /99\.9|99\.5/.test(blob)) {
      return false;
    }
    if (facts.paymentMode === "monthly_retainer" && !facts.milestoneSplit403030 && /\bmilestone\b/.test(blob)) {
      return false;
    }
    return true;
  });
}

export function applyIntakePrefillToSession<T extends { answered: Record<string, string> }>(
  session: T,
  intakeRaw = "",
): T {
  const pre = deriveIntakePrefilledAnswers(parseGuidedIntakeFacts(intakeRaw));
  if (!Object.keys(pre).length) return session;
  return {
    ...session,
    answered: { ...pre, ...session.answered },
  };
}

export function reconcileSessionAnswersWithIntake<T extends { answered: Record<string, string> }>(
  session: T,
  intakeRaw = "",
): T {
  const facts = parseGuidedIntakeFacts(intakeRaw);
  const answered = { ...session.answered };
  if (facts.milestoneSplit403030 && facts.phaseAllocationText) {
    if (/even\s+thirds|build-heavy|one-third\s+each/i.test(answered.phase_payment_allocation || "")) {
      answered.phase_payment_allocation = facts.phaseAllocationText;
    }
    if (!answered.payment_structure || /monthly\s+retainer/i.test(answered.payment_structure)) {
      answered.payment_structure = facts.paymentStructureText || "Milestone-based payments per Schedule A.";
    }
  }
  if (facts.noThirdPartyUptimeGuarantee) {
    if (/99\.9|99\.5|\buptime\s+target\b/i.test(answered.saas_sla || "")) {
      answered.saas_sla =
        "No guaranteed uptime for third-party AI platforms; commercially reasonable support only.";
    }
  }
  if (facts.terminationDays != null) {
    const notice = `${facts.terminationDays} days written notice`;
    if (!answered.renewal_notice || /\bO\s+days\b/i.test(answered.renewal_notice)) {
      answered.renewal_notice = notice;
    }
  }
  return { ...session, answered };
}
