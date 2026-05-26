/**
 * Treat structured semantic facts + corpus evidence as authoritative for finalization gates.
 */

import {
  extractGuidedSemanticFacts,
  type GuidedSemanticFacts,
} from "./guidedAnswerSemanticMerger";
import type { GuidedCompletionSession } from "./types";
import {
  deriveIntakePrefilledAnswers,
  parseGuidedIntakeFacts,
} from "./guidedIntakeFactPrefill";

const FEES_SECTION_RE = /^\s*2\.\s+[^\n]+[\s\S]*?(?=^\s*3\.\s+)/im;
const MISC_SECTION_RE = /^\s*(?:8|9|10)\.\s+[^\n]*(?:miscellaneous|governing)/im;

function sectionBlob(text: string, sectionRe: RegExp): string {
  const m = text.match(sectionRe);
  return m?.[0] ?? "";
}

export function corpusSatisfiesGuidedVariable(
  variableId: string,
  body: string,
  semantic: GuidedSemanticFacts,
  intakeRaw = "",
): boolean {
  const normalized = (body || "").replace(/\s+/g, " ");
  const intakeFacts = parseGuidedIntakeFacts(intakeRaw);
  const fees = sectionBlob(body, FEES_SECTION_RE) || normalized;
  const misc = sectionBlob(body, MISC_SECTION_RE) || normalized;

  switch (variableId) {
    case "phase_payment_allocation":
    case "supplemental_schedule_confirmation":
    case "as_specified_in_schedule_a":
    case "milestone_schedule":
      if (semantic.milestoneSplit === "40_30_30") {
        return /40\s*%/.test(fees) && /30\s*%/.test(fees) && !/\beven\s+thirds\b/i.test(normalized);
      }
      if (semantic.paymentMode === "milestone_project" || intakeFacts.milestoneSplit403030) {
        return /\bmilestone|schedule\s+a|phase\s+allocation|40\s*%/i.test(fees);
      }
      return false;
    case "payment_structure":
      if (semantic.paymentMode === "monthly_retainer") {
        return /\$[\d,]+(?:\.\d{2})?\s*(?:per\s+)?month|monthly/i.test(fees);
      }
      if (semantic.paymentMode === "milestone_project") {
        return /\bmilestone|schedule\s+a|phase\s+allocation|written\s+acceptance/i.test(fees);
      }
      return false;
    case "project_fee_phase_confirmation":
    case "total_fee_confirmation":
    case "amount_to_be_confirmed":
      return /\$[\d,]+/.test(fees) || /\btotal\s+project\s+fee\b/i.test(fees);
    case "payment_timing":
    case "payment_timing_to_be_confirmed":
      return /\bNet\s*\d+\b/i.test(fees) || /\bon\s+receipt\b/i.test(fees);
    case "renewal_notice":
    case "termination":
      if (semantic.terminationDays != null) {
        return new RegExp(`\\b${semantic.terminationDays}\\s+days?\\b`, "i").test(normalized);
      }
      return /\b\d{1,3}\s+days?\s+written\s+notice\b/i.test(normalized);
    case "governing_law":
    case "governing_law_notice":
    case "governing_venue": {
      const law = semantic.governingLaw || intakeFacts.governingLaw;
      if (!law) return false;
      return new RegExp(`\\b${law}\\b`, "i").test(misc) && !new RegExp(`\\b${law}\\b`, "i").test(fees);
    }
    case "saas_sla":
    case "support_obligations": {
      const supportAnswer = semantic.facts.support_sla || "";
      if (intakeFacts.noThirdPartyUptimeGuarantee || /no\s+guaranteed\s+uptime/i.test(supportAnswer)) {
        return (
          !/\b99\.9\s*%/.test(normalized) &&
          /\b(?:no\s+guaranteed\s+uptime|commercially\s+reasonable\s+support|third[-\s]?party\s+ai\s+platform)/i.test(
            normalized,
          )
        );
      }
      if (/99\.9|99\.5/.test(supportAnswer)) {
        return /\b99\.9|99\.5/.test(normalized);
      }
      return /\b(?:uptime|sla)\b/i.test(normalized);
    }
    case "ip_ownership":
    case "ip_allocation":
      return /\b(?:owns?|assigned|work\s+product|deliverables?)\b/i.test(normalized);
    case "license_background_tools":
      return /\b(?:pre-existing|background)\s+(?:tools|materials|know-how)/i.test(normalized);
    default:
      return false;
  }
}

/** Map semantic reconcile + intake facts into guided answer keys for manifest completeness. */
export function semanticFactsToGuidedAnswerPrefill(
  semantic: GuidedSemanticFacts,
  intakeRaw = "",
): Record<string, string> {
  const out = { ...deriveIntakePrefilledAnswers(parseGuidedIntakeFacts(intakeRaw)) };
  if (semantic.paymentMode === "milestone_project") {
    out.payment_structure =
      out.payment_structure || "Milestone-based payments tied to phase acceptance per Schedule A.";
  }
  if (semantic.milestoneSplit === "40_30_30") {
    out.phase_payment_allocation =
      out.phase_payment_allocation ||
      "40% build/configuration, 30% rollout/onboarding, 30% support/acceptance";
    out.payment_structure = out.payment_structure || "Milestone-based payments per Schedule A.";
  }
  if (semantic.terminationDays != null) {
    out.renewal_notice = `${semantic.terminationDays} days written notice`;
  }
  if (semantic.governingLaw) {
    out.governing_law = semantic.governingLaw;
    out.governing_law_notice = `Laws of the State of ${semantic.governingLaw}`;
  }
  return out;
}

const SEMANTIC_INTAKE_ONLY_MANIFEST_IDS = new Set([
  "phase_payment_allocation",
  "payment_structure",
  "project_fee_phase_confirmation",
  "total_fee_confirmation",
  "amount_to_be_confirmed",
  "supplemental_schedule_confirmation",
  "as_specified_in_schedule_a",
  "milestone_schedule",
  "payment_timing",
  "payment_timing_to_be_confirmed",
  "renewal_notice",
  "termination",
  "governing_law",
  "governing_law_notice",
  "governing_venue",
]);

function isManifestVariableSatisfied(args: {
  variableId: string;
  body: string;
  semantic: GuidedSemanticFacts;
  intakeRaw: string;
  session: GuidedCompletionSession | null | undefined;
}): boolean {
  if (corpusSatisfiesGuidedVariable(args.variableId, args.body, args.semantic, args.intakeRaw)) {
    return true;
  }
  const intakePrefill = deriveIntakePrefilledAnswers(parseGuidedIntakeFacts(args.intakeRaw));
  const semanticPrefill = semanticFactsToGuidedAnswerPrefill(args.semantic, args.intakeRaw);
  if (!SEMANTIC_INTAKE_ONLY_MANIFEST_IDS.has(args.variableId)) {
    return false;
  }
  return Boolean(
    (intakePrefill[args.variableId] || "").trim() || (semanticPrefill[args.variableId] || "").trim(),
  );
}

export function filterManifestMissingWithSemanticEvidence(args: {
  missing: readonly string[];
  body: string;
  guidedSession: GuidedCompletionSession | null | undefined;
  originalIntake?: string;
}): string[] {
  const intake = args.originalIntake ?? "";
  const semantic = extractGuidedSemanticFacts(args.guidedSession, intake);
  return args.missing.filter(
    (id) =>
      !isManifestVariableSatisfied({
        variableId: id,
        body: args.body,
        semantic,
        intakeRaw: intake,
        session: args.guidedSession,
      }),
  );
}
