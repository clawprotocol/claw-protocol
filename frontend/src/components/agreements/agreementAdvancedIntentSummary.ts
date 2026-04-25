/**
 * Human-readable intent lines for the complexity gate (avoid generic “advanced only”).
 */
import type { AgreementFamily } from "./agreementFamilyRouter";

/** Which limitation lens to show after the user picks “simplified” on an advanced intercept. */
export type SimplifiedAdvancedLimitationVariant = "consulting_entity" | "governance_ownership" | "commercial_risk" | "general";

const SIMPLIFIED_LIMITATION_COPY: Record<SimplifiedAdvancedLimitationVariant, string> = {
  consulting_entity:
    "This starter draft covers the service relationship, but custom ownership, governance, member rights, and internal business structure are not fully defined here.",
  governance_ownership:
    "This starter draft does not fully define voting, distributions, exits, ownership rights, or governance mechanics.",
  commercial_risk:
    "This starter draft does not fully define advanced liability, dispute handling, custom payment mechanics, or negotiated risk allocation.",
  general:
    "This starter draft covers the basics, but finer commercial terms, liability, and bespoke structure are not fully spelled out here.",
};

function intakeSuggestsGovernanceOwnership(rawIntake: string, family: AgreementFamily | undefined): boolean {
  if (family === "operating_agreement") return true;
  const low = (rawIntake || "").toLowerCase();
  if (!rawIntake.trim()) return false;
  if (/\boperating\s+agreement\b/i.test(rawIntake)) return true;
  if (
    /\b(?:members?|membership|ownership\s+interest|managing\s+member|capital\s+accounts?|distributions?)\b/i.test(
      low,
    ) &&
    /\b(?:llc|corp|company)\b/i.test(low)
  ) {
    return true;
  }
  if (/\bgovernance\b/i.test(low) && /\b(?:llc|members?|managers?|board)\b/i.test(low)) return true;
  return false;
}

function intakeSuggestsConsultingEntityStructure(rawIntake: string, family: AgreementFamily | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!rawIntake.trim()) return false;
  const entity = /\bllc\b|\bl\.l\.c\.\b|\binc\.?\b|\bcorp\.?\b|\bltd\.?\b/i.test(rawIntake);
  const consulting =
    family === "consulting_agreement" || /\bconsult(?:ing|ant)?\b|\bretainer\b|\bsow\b/i.test(low);
  return consulting && entity;
}

function intakeSuggestsAdvancedCommercialRisk(rawIntake: string): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!rawIntake.trim()) return false;
  if (/\b(?:earnout|royalt(?:y|ies)|liquidated\s+damages|carve[\s-]?out)\b/i.test(low)) return true;
  if (/\b(?:custom\s+)?liabilit(?:y|ies)\b/i.test(low) && /\b(?:indemnif|hold\s+harmless)\b/i.test(low)) return true;
  if (
    /\b(?:milestone|escrow|revenue\s*share|equity\s+compensation|performance\s+bonus|tiered\s+pricing)\b/i.test(low)
  ) {
    return true;
  }
  if (/\bmultiple\s+obligations\b/i.test(low)) return true;
  return false;
}

/**
 * Agreement-specific scope note for the simplified path after an advanced complexity intercept.
 * Plain English, trust-preserving — not a substitute for legal advice.
 */
export function getSimplifiedAdvancedLimitationCopy(
  rawIntake: string,
  agreementFamily: AgreementFamily | undefined,
): { variant: SimplifiedAdvancedLimitationVariant; text: string } {
  if (intakeSuggestsGovernanceOwnership(rawIntake, agreementFamily)) {
    return { variant: "governance_ownership", text: SIMPLIFIED_LIMITATION_COPY.governance_ownership };
  }
  if (intakeSuggestsConsultingEntityStructure(rawIntake, agreementFamily)) {
    return { variant: "consulting_entity", text: SIMPLIFIED_LIMITATION_COPY.consulting_entity };
  }
  if (intakeSuggestsAdvancedCommercialRisk(rawIntake)) {
    return { variant: "commercial_risk", text: SIMPLIFIED_LIMITATION_COPY.commercial_risk };
  }
  return { variant: "general", text: SIMPLIFIED_LIMITATION_COPY.general };
}

/** Value-based upgrade CTA for the simplified-advanced review banner (not generic “upgrade”). */
export type SimplifiedAdvancedUpgradeCtaVariant = "unlock_complete" | "generate_full" | "full_protections";

const UPGRADE_CTA_LABELS: Record<SimplifiedAdvancedUpgradeCtaVariant, string> = {
  unlock_complete: "Unlock Complete Agreement",
  generate_full: "Generate Full Agreement",
  full_protections: "Get Full Protections",
};

export const SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE =
  "Easier collaboration before signing — plus cleaner terms, stronger protections, and tracked proof when you’re ready.";

/**
 * Pick CTA copy: consulting/entity or governance → unlock; liability/risk-heavy → protections; else generate full.
 */
export function getSimplifiedAdvancedUpgradeCtaCopy(
  rawIntake: string,
  agreementFamily: AgreementFamily | undefined,
): { variant: SimplifiedAdvancedUpgradeCtaVariant; label: string; trustLine: string } {
  if (
    intakeSuggestsGovernanceOwnership(rawIntake, agreementFamily) ||
    intakeSuggestsConsultingEntityStructure(rawIntake, agreementFamily)
  ) {
    return {
      variant: "unlock_complete",
      label: UPGRADE_CTA_LABELS.unlock_complete,
      trustLine: SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE,
    };
  }
  if (intakeSuggestsAdvancedCommercialRisk(rawIntake)) {
    return {
      variant: "full_protections",
      label: UPGRADE_CTA_LABELS.full_protections,
      trustLine: SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE,
    };
  }
  return {
    variant: "generate_full",
    label: UPGRADE_CTA_LABELS.generate_full,
    trustLine: SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE,
  };
}

export function summarizeComplexityGateIntent(rawIntake: string, family: AgreementFamily | undefined): string {
  const low = (rawIntake || "").toLowerCase();
  const governanceHeavy =
    family === "operating_agreement" ||
    /\boperating\s+agreement\b/i.test(rawIntake) ||
    /\b(?:members?|membership|ownership\s+interest|managing\s+member|capital\s+accounts?|distributions?)\b/i.test(low) ||
    (/\bgovernance\b/i.test(low) && /\b(?:llc|members?|managers?|board)\b/i.test(low));

  if (governanceHeavy) {
    return "This looks like a governance / ownership agreement.";
  }

  const consultingCommercial =
    /\bconsult(?:ing|ant)?\b|\bretainer\b|\bsow\b|\bmsa\b|\bengagement\b/i.test(low) ||
    /\b(?:custom|complex)\s+(?:liabilit|term|payment)/i.test(low) ||
    /\bmultiple\s+obligations\b/i.test(low) ||
    (/\bllc\b/i.test(low) && /\bconsult(?:ing|ant)?\b/i.test(low));

  if (consultingCommercial) {
    return "This looks like a consulting / business agreement with custom terms.";
  }

  return "This looks like a consulting / business agreement with custom terms.";
}
