import { detectAgreementFamily, mergeAgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { mergeMaterialAsksIntoAdditionalTerms } from "./materialAsksMerge";

export type ApiAgreementParseExtract = {
  material_asks?: unknown;
  agreement_family_hint?: unknown;
  confidence?: unknown;
};

/**
 * Merge premium-only `extract` from POST /api/agreements/parse. When `extract` is absent, returns `base` unchanged.
 */
export function applyPremiumParseExtract(
  base: ParsedDraftShape,
  intake: string,
  extract: ApiAgreementParseExtract | null | undefined,
): ParsedDraftShape {
  if (extract == null || typeof extract !== "object") {
    return base;
  }
  const detected = detectAgreementFamily(intake);
  const hint = extract.agreement_family_hint != null ? String(extract.agreement_family_hint) : null;
  const family = mergeAgreementFamily(detected, hint, intake);
  const material = Array.isArray(extract.material_asks)
    ? (extract.material_asks as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];
  let next: ParsedDraftShape = { ...base, agreement_family: family };
  if (material.length) {
    next = { ...next, material_asks: material };
    next = mergeMaterialAsksIntoAdditionalTerms(next);
  }
  return next;
}
