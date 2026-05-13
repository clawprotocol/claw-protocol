/**
 * Launch policy: single source of truth for instant vs. advanced agreement handling.
 *
 * `AgreementFamily` values come from `detectAgreementFamily`; some launch names are
 * broader product labels (e.g. `contractor`) or phrase-only (`safe`) until routed.
 */
import type { AgreementFamily } from "./agreementFamilyRouter";

/** Launch labels — instant path at ship (maps to router families + employment phrase). */
export const INSTANT_FAMILIES = [
  "nda",
  "consulting",
  "contractor",
  "employment",
  "service_agreement",
] as const;

/** Launch labels — advanced full draft is premium-gated. */
export const ADVANCED_FAMILIES = [
  "operating_agreement",
  "bylaws",
  "safe",
  "convertible_note",
  "shareholder_agreement",
  "joint_venture",
  "governance_agreement",
] as const;

const ROUTER_INSTANT_FAMILIES: readonly AgreementFamily[] = [
  "nda",
  "consulting_agreement",
  "independent_contractor_agreement",
  "services_agreement",
];

export function intakeLooksLikeEmploymentAgreement(intakeText: string): boolean {
  const t = (intakeText || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  if (!t) return false;
  if (/\bemployment\s+agreement\b/i.test(t)) return true;
  if (/\boffer\s+of\s+employment\b/i.test(low)) return true;
  if (/\bwork\s+for\s+hire\b/i.test(low) && /\b(?:agreement|contract)\b/i.test(low)) return true;
  if (/\bemployee\b/i.test(low) && /\b(?:agreement|contract)\b/i.test(low) && !/\bcontractor\b/i.test(low)) return true;
  return false;
}

export function isInstantLaunchFamily(intakeText: string, family: AgreementFamily | undefined): boolean {
  if (!family) return true;
  if (ROUTER_INSTANT_FAMILIES.includes(family)) return true;
  if (family === "generic_business_agreement" && intakeLooksLikeEmploymentAgreement(intakeText)) return true;
  return false;
}

/**
 * Detects "advisor" intent — advisor/board-advisor agreements should NEVER be hard-blocked
 * by the complexity gate even when small equity grants are mentioned (regression spec §6).
 * Premium upsell remains available AFTER starter generation as progressive enhancement.
 */
export function intakeLooksLikeAdvisorAgreement(intakeText: string): boolean {
  const low = (intakeText || "").toLowerCase();
  if (!low) return false;
  return (
    /\badvisor(?:y|s)?\s+agreement\b/.test(low) ||
    /\bboard\s+advisor\b/.test(low) ||
    /\badvisor\s+(?:between|for|to)\b/.test(low) ||
    /\b(?:strategic|technical|product)\s+advisor\b/.test(low)
  );
}

/**
 * Heuristic: cap-table / governance complexity that genuinely requires a full operating-agreement
 * draft (vs. a simplified starter). Used to RELAX the gate for plain "operating agreement for
 * 3-member LLC" intakes (regression spec §6), while still gating on truly complex setups.
 */
export function operatingAgreementHasHighComplexitySignals(intakeText: string): boolean {
  const low = (intakeText || "").toLowerCase();
  if (!low) return false;
  // Multiple member classes / preferred units
  if (/\b(?:class\s+[abcd]\b|preferred\s+(?:units|members|interests)|common\s+units|series\s+[abcd]\b)/i.test(low)) {
    return true;
  }
  // Vesting schedules
  if (/\bvesting\b/i.test(low) || /\bcliff\b/i.test(low) || /\bre[-\s]?vest\b/i.test(low)) return true;
  // Pro-rata / participation rights
  if (/\bpro[-\s]?rata\b/i.test(low) || /\bparticipation\s+rights?\b/i.test(low)) return true;
  // Custom waterfalls / distribution preferences
  if (/\bwaterfall\b/i.test(low) || /\bpreferred\s+return\b/i.test(low) || /\bcatch[-\s]?up\b/i.test(low)) return true;
  // Drag-along / tag-along / right of first refusal
  if (/\bdrag[-\s]?along\b/i.test(low) || /\btag[-\s]?along\b/i.test(low) || /\bright\s+of\s+first\s+refusal\b/i.test(low) || /\brofr\b/i.test(low)) {
    return true;
  }
  // Capital call mechanics with cure / dilution
  if (/\bcapital\s+calls?\b/i.test(low) && /\b(?:cure|default|dilution|penalty)\b/i.test(low)) return true;
  // Complex management with multiple managers / board structure
  if (/\bboard\s+of\s+managers\b/i.test(low) || /\bmanagement\s+committee\b/i.test(low)) return true;
  return false;
}

/**
 * True when intake mixes entity / governance / economics signals that a thin instant
 * template can mislabel — stop before auto-generate and show the complexity gate.
 *
 * Regression spec §6: advisor agreements are now ALWAYS allowed to generate a starter,
 * and simple LLC operating agreements only gate when truly complex.
 */
export function matchesAdvancedCommercialStructureSignals(intakeText: string): boolean {
  const t = (intakeText || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  if (!t) return false;

  // Advisor agreements are explicitly EXCLUDED from gating — progressive enhancement only.
  if (intakeLooksLikeAdvisorAgreement(t)) return false;

  const entityShell = /\bllc\b|\bl\.l\.c\.\b|\bltd\.?\b|\binc\.?\b|\bcorp\.?\b/i.test(t);
  const ownershipCluster =
    /\b(?:members?|membership|managing\s+member|ownership\s+interest|capital\s+accounts?|profit\s*interests?|distributions?|capital\s+contributions?|equity|units?)\b/i.test(
      low,
    );

  // Plain entity + ownership wording is no longer gating-worthy on its own — only gate
  // if accompanied by *complex* economics/governance signals.
  if (entityShell && ownershipCluster) {
    if (operatingAgreementHasHighComplexitySignals(t)) return true;
    // Otherwise allow simplified starter (regression spec §6).
  }

  if (/\bgovernance\b/i.test(low) && /\b(?:llc|members?|managers?|board|company|corp)\b/i.test(low)) return true;

  if (/\b(?:custom\s+)?liabilit(?:y|ies)\b/i.test(low) && /\b(?:indemnif|hold\s+harmless|defend)\b/i.test(low)) return true;

  if (/\bmultiple\s+obligations\b/i.test(low)) return true;

  if (/\b(?:earnout|royalt(?:y|ies)|liquidated\s+damages|carve[\s-]?out)\b/i.test(low)) return true;

  if (/\bconsult(?:ing|ant)\b/i.test(low) && entityShell && ownershipCluster && operatingAgreementHasHighComplexitySignals(t)) {
    return true;
  }

  if (
    /\b(?:escrow|revenue\s*share|equity\s+compensation|performance\s+bonus|tiered\s+pricing)\b/i.test(low)
  ) {
    return true;
  }

  return false;
}

export function matchesAdvancedInstrumentPhrases(intakeText: string): boolean {
  const t = (intakeText || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  if (!t) return false;
  if (/\bsafe\b/i.test(low)) return true;
  if (/\bsimple\s+agreement\s+for\s+future\s+equity\b/i.test(low)) return true;
  if (/\bconvertible\s+note\b/i.test(low)) return true;
  if (/\bbylaws?\b/i.test(low)) return true;
  if (/\bshareholder\s+agreement\b/i.test(low)) return true;
  if (/\bjoint\s+venture\b/i.test(low)) return true;
  if (/\bgovernance\s+agreement\b/i.test(low)) return true;
  if (/\bstock\s+purchase\b/i.test(low)) return true;
  if (/\bgovernance\b/i.test(low) && /\b(?:agreement|document|plan|llc|corp)\b/i.test(low)) return true;
  return false;
}

/**
 * True when intake should stop before review and show the complexity gate
 * (simplified instant vs. unlock full advanced).
 *
 * Regression spec §6: progressive enhancement UX — advisor agreements always pass through,
 * and operating agreements only gate when high-complexity signals are present (vesting,
 * preferred classes, waterfalls, drag/tag-along, etc.). Simple 3-member LLCs generate a
 * starter and surface the premium upsell after generation.
 */
export function shouldInterceptAdvancedDocumentFamily(intakeText: string, family: AgreementFamily | undefined): boolean {
  if (intakeLooksLikeAdvisorAgreement(intakeText)) return false;
  if (family === "operating_agreement") {
    return operatingAgreementHasHighComplexitySignals(intakeText);
  }
  if (matchesAdvancedInstrumentPhrases(intakeText)) return true;
  if (matchesAdvancedCommercialStructureSignals(intakeText)) return true;
  return false;
}
