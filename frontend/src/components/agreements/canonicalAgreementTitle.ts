/**
 * Single canonical-title resolver for starter / family shell rendering.
 *
 * Rules (universal — never family-specific):
 *   1. If the parsed/server title is a substantive non-generic value, KEEP IT.
 *   2. Otherwise, fall back to the live preview docTitle (already keyword-derived).
 *   3. Otherwise, derive from the routed agreement family.
 *
 * Generic/empty titles that must be replaced: "", "Agreement", "[Not yet specified]".
 *
 * NEVER overwrite a substantive title (anything else) — this preserves canonical headings
 * already set by upstream parsing or family shells (e.g. "Mutual Non-Disclosure Agreement").
 */
import type { AgreementFamily } from "./agreementFamilyRouter";

export const CANONICAL_TITLE_FOR_FAMILY: Record<AgreementFamily, string> = {
  operating_agreement: "Operating Agreement",
  nda: "Non-Disclosure Agreement",
  consulting_agreement: "Consulting Agreement",
  services_agreement: "Services Agreement",
  independent_contractor_agreement: "Independent Contractor Agreement",
  confidentiality_commercial_protections_agreement: "Confidentiality & Commercial Protections Agreement",
  generic_business_agreement: "Business Agreement",
};

const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^\s*$/,
  /^agreement$/i,
  /^\[not yet specified\]$/i,
  /^untitled$/i,
  // Imperative phrasings ("Create an LLC", "Draft an NDA", etc.) are intent verbs not titles.
  /^(?:create|draft|build|form|generate|make|prepare|start|set\s+up|setup)\b/i,
];

/**
 * Family-specific legacy titles that should be replaced with the canonical heading.
 * E.g. NDA family must always read "Non-Disclosure Agreement" — never the legacy
 * "Confidentiality Agreement" / "Mutual Confidentiality Agreement" labels.
 */
const FAMILY_LEGACY_TITLE_PATTERNS: Partial<Record<AgreementFamily, RegExp[]>> = {
  nda: [/^confidentiality\s+agreement$/i, /^mutual\s+confidentiality\s+agreement$/i],
  // For consulting family, "Consulting Agreement" / "Business Agreement" are replaceable when
  // the intake clearly says "advisor" — see resolveCanonicalAgreementTitle's advisor override.
  consulting_agreement: [/^business\s+agreement$/i, /^lease\s+agreement$/i],
  // Operating-agreement legacy titles that snuck in from imperative parses.
  operating_agreement: [/^operating\s+agreement\b\s*[—-]\s*create\b/i],
};

export function isGenericOrEmptyTitle(title: string | null | undefined, family?: AgreementFamily): boolean {
  const t = (title || "").trim();
  if (!t) return true;
  if (GENERIC_TITLE_PATTERNS.some((re) => re.test(t))) return true;
  if (family) {
    const familyLegacy = FAMILY_LEGACY_TITLE_PATTERNS[family];
    if (familyLegacy && familyLegacy.some((re) => re.test(t))) return true;
  }
  return false;
}

export type CanonicalTitleResolution = {
  title: string;
  /** "preserved" = upstream title kept; "live" = derived from live docTitle; "family" = family canonical. */
  source: "preserved" | "live" | "family" | "advisor" | "nda-mutual" | "explicit-intent";
};

/**
 * Explicit document-intent → canonical title.
 *
 * Universal invariant 2: when intake plainly says "lease agreement" / "purchase agreement" /
 * "co-ownership agreement" / "property management agreement" / etc., that intent should drive
 * the title — even if the routed family is the catch-all "generic_business_agreement".
 *
 * Returns null when no explicit intent phrase is found (callers fall back to family canonical).
 */
export function explicitIntentCanonicalTitle(rawIntake: string | null | undefined): string | null {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return null;
  if (/\b(?:residential|commercial)?\s*lease\s+agreement\b/.test(low)) return "Lease Agreement";
  if (/\bsublease\s+agreement\b/.test(low)) return "Sublease Agreement";
  if (/\b(?:real\s+estate\s+)?purchase\s+(?:and\s+sale\s+)?agreement\b/.test(low)) {
    return /\breal\s+estate\b/.test(low) ? "Real Estate Purchase Agreement" : "Purchase Agreement";
  }
  if (/\bco[-\s]?ownership\s+agreement\b/.test(low)) return "Co-Ownership Agreement";
  if (/\bproperty\s+management\s+agreement\b/.test(low)) return "Property Management Agreement";
  if (/\blicense\s+agreement\b/.test(low)) return "License Agreement";
  if (/\bdistribution\s+agreement\b/.test(low)) return "Distribution Agreement";
  if (/\bpartnership\s+agreement\b/.test(low)) return "Partnership Agreement";
  if (/\bjoint\s+venture\s+agreement\b/.test(low)) return "Joint Venture Agreement";
  if (/\bequipment\s+(?:rental|lease)\s+agreement\b/.test(low)) return "Equipment Lease Agreement";
  if (/\bemployment\s+agreement\b/.test(low)) return "Employment Agreement";
  if (/\bindependent\s+contractor\s+agreement\b/.test(low)) return "Independent Contractor Agreement";
  return null;
}

/**
 * Detects "advisor" intent in raw intake — used by canonical title resolution to choose
 * "Advisor Agreement" over a generic "Consulting Agreement" / "Business Agreement" heading.
 */
function intakeSaysAdvisor(rawIntake: string | null | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return false;
  return (
    /\badvisor(?:y|s)?\s+agreement\b/.test(low) ||
    /\bboard\s+advisor\b/.test(low) ||
    /\b(?:strategic|technical|product)\s+advisor\b/.test(low) ||
    /\badvisor\s+(?:between|for|to)\b/.test(low)
  );
}

/**
 * Detects mutual NDA intent for canonical title selection ("Mutual Non-Disclosure Agreement"
 * vs. "Non-Disclosure Agreement").
 */
function intakeSaysMutualNda(rawIntake: string | null | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return false;
  if (/\b(?:one[-\s]?way|unilateral)\b/.test(low)) return false;
  return /\bmutual\b/.test(low) || /\bbetween\s+\w/.test(low);
}

export function resolveCanonicalAgreementTitle(opts: {
  currentTitle: string | null | undefined;
  liveDocTitle: string | null | undefined;
  family: AgreementFamily;
  /** Optional raw intake — enables advisor + mutual-NDA canonical overrides. */
  intakeText?: string | null;
}): CanonicalTitleResolution {
  const current = (opts.currentTitle || "").trim();
  const intake = opts.intakeText ?? null;

  // Advisor override: when intake clearly says "advisor", canonical title is "Advisor Agreement"
  // even if family routes through consulting_agreement (P3).
  if (
    (opts.family === "consulting_agreement" || opts.family === "generic_business_agreement") &&
    intakeSaysAdvisor(intake)
  ) {
    if (
      !current ||
      isGenericOrEmptyTitle(current, opts.family) ||
      /^business\s+agreement$/i.test(current) ||
      /^consulting\s+agreement$/i.test(current)
    ) {
      return { title: "Advisor Agreement", source: "advisor" };
    }
  }

  // Mutual NDA override: prefer the mutual heading when intake clearly says NDA + mutual / between-multiparty.
  if (opts.family === "nda" && intakeSaysMutualNda(intake)) {
    if (
      !current ||
      isGenericOrEmptyTitle(current, opts.family) ||
      /^non[-\s]?disclosure\s+agreement$/i.test(current)
    ) {
      return { title: "Mutual Non-Disclosure Agreement", source: "nda-mutual" };
    }
  }

  // Universal invariant 2: explicit document-intent phrases dominate routing for the
  // catch-all "generic_business_agreement" family (lease, purchase, co-ownership, property
  // management, license, distribution, partnership, JV, equipment lease, etc.). Specific
  // family routes (nda, consulting, services, OA) keep their canonical titles unless a
  // dedicated override (advisor / mutual-NDA / family legacy) already fired above.
  if (opts.family === "generic_business_agreement") {
    const intentTitle = explicitIntentCanonicalTitle(intake);
    if (intentTitle) {
      if (!current || isGenericOrEmptyTitle(current, opts.family) || /^business\s+agreement$/i.test(current)) {
        return { title: intentTitle, source: "explicit-intent" };
      }
    }
  }

  if (current && !isGenericOrEmptyTitle(current, opts.family)) {
    return { title: current, source: "preserved" };
  }
  const live = (opts.liveDocTitle || "").trim();
  if (live && !isGenericOrEmptyTitle(live, opts.family)) {
    return { title: live, source: "live" };
  }
  return { title: CANONICAL_TITLE_FOR_FAMILY[opts.family] ?? "Business Agreement", source: "family" };
}
