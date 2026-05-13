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
];

export function isGenericOrEmptyTitle(title: string | null | undefined): boolean {
  const t = (title || "").trim();
  if (!t) return true;
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(t));
}

export type CanonicalTitleResolution = {
  title: string;
  /** "preserved" = upstream title kept; "live" = derived from live docTitle; "family" = family canonical. */
  source: "preserved" | "live" | "family";
};

export function resolveCanonicalAgreementTitle(opts: {
  currentTitle: string | null | undefined;
  liveDocTitle: string | null | undefined;
  family: AgreementFamily;
}): CanonicalTitleResolution {
  const current = (opts.currentTitle || "").trim();
  if (current && !isGenericOrEmptyTitle(current)) {
    return { title: current, source: "preserved" };
  }
  const live = (opts.liveDocTitle || "").trim();
  if (live && !isGenericOrEmptyTitle(live)) {
    return { title: live, source: "live" };
  }
  return { title: CANONICAL_TITLE_FOR_FAMILY[opts.family] ?? "Business Agreement", source: "family" };
}
