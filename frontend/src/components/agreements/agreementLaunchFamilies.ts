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
 * True when intake mixes entity / governance / economics signals that a thin instant
 * template can mislabel — stop before auto-generate and show the complexity gate.
 */
export function matchesAdvancedCommercialStructureSignals(intakeText: string): boolean {
  const t = (intakeText || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  if (!t) return false;

  const entityShell = /\bllc\b|\bl\.l\.c\.\b|\bltd\.?\b|\binc\.?\b|\bcorp\.?\b/i.test(t);
  const ownershipCluster =
    /\b(?:members?|membership|managing\s+member|ownership\s+interest|capital\s+accounts?|profit\s*interests?|distributions?|capital\s+contributions?|equity|units?)\b/i.test(
      low,
    );
  if (entityShell && ownershipCluster) return true;

  if (/\boperating\s+agreement\b/i.test(low)) return true;

  if (/\bgovernance\b/i.test(low) && /\b(?:llc|members?|managers?|board|company|corp)\b/i.test(low)) return true;

  if (/\b(?:custom\s+)?liabilit(?:y|ies)\b/i.test(low) && /\b(?:indemnif|hold\s+harmless|defend)\b/i.test(low)) return true;

  if (/\bmultiple\s+obligations\b/i.test(low)) return true;

  if (/\b(?:earnout|royalt(?:y|ies)|liquidated\s+damages|carve[\s-]?out)\b/i.test(low)) return true;

  if (/\bconsult(?:ing|ant)\b/i.test(low) && entityShell && ownershipCluster) return true;

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
 */
export function shouldInterceptAdvancedDocumentFamily(intakeText: string, family: AgreementFamily | undefined): boolean {
  if (family === "operating_agreement") return true;
  if (matchesAdvancedInstrumentPhrases(intakeText)) return true;
  if (matchesAdvancedCommercialStructureSignals(intakeText)) return true;
  return false;
}
