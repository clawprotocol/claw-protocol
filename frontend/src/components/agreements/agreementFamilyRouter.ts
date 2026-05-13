/**
 * Deterministic local agreement “family” for intake defaults, starter templates, analytics, and UI routing.
 * It is **not** LawDog Pro truth: paid Pro completion is gated by authoritative pipeline sources,
 * `validatePaidProOutput` / source-fact checks, and intent contract substance — not this enum alone.
 * No network / LLM — keyword and phrase rules only.
 */
export type AgreementFamily =
  | "consulting_agreement"
  | "services_agreement"
  | "nda"
  | "confidentiality_commercial_protections_agreement"
  | "independent_contractor_agreement"
  | "operating_agreement"
  | "generic_business_agreement";

/**
 * Order: more specific families before generic fallbacks.
 */
export function detectAgreementFamily(intakeText: string): AgreementFamily {
  const t = intakeText.replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  if (!t) return "generic_business_agreement";

  const commercialSignals = {
    referralLike: /\b(referral|channel\s+partner|introduced?\s+accounts?|introduced?\s+deals?|sourced\s+deals?|growth\s+partner|business\s+development)\b/i.test(low),
    commission: /\bcommission|referral\s+fee|%\s*(?:of\s+)?(?:sales|revenue|net|gross)\b/i.test(low),
    contractorLike: /\b(independent\s+contractor|contractor|freelance|1099)\b/i.test(low),
    servicesLike: /\b(marketing|services?|deliverables?|scope|campaign|ad\s+accounts?|compliance|approval)\b/i.test(low),
    ownershipLike: /\b(ownership|crm|lead\s+data|work\s+product|intellectual\s+property)\b/i.test(low),
    exclusivityLike: /\b(exclusiv|territor|qualified\s+leads?)\b/i.test(low),
    reimbursementLike: /\breimburs|pre-?approved\s+expenses?\b/i.test(low),
    nda: /\b(?:mutual\s+)?nda\b|\bnon[-\s]?disclosure\b|\bconfidentiality\b/i.test(low),
  };
  const serviceCommerceSignals =
    commercialSignals.referralLike ||
    commercialSignals.commission ||
    commercialSignals.contractorLike ||
    commercialSignals.servicesLike ||
    commercialSignals.ownershipLike ||
    commercialSignals.exclusivityLike ||
    commercialSignals.reimbursementLike;
  const ndaHybridSignals =
    /\b(ownership|ip|intellectual\s+property|invention|work\s+product|customer\s+list|crm|lead\s+data|non[-\s]?solicit|no[-\s]?hire|poach|non[-\s]?circumvent|contractor|services?|collaboration|referral|introduction|commission|pilot|trial|evaluation)\b/i.test(
      low,
    );
  const ndaDominant = commercialSignals.nda && !serviceCommerceSignals;

  if (
    /\boperating\s+agreement\b/i.test(t) ||
    /\bllc\s+agreement\b/i.test(low) ||
    /\bmember[-\s]?managed\b/i.test(t) ||
    /\bmanager[-\s]?managed\b/i.test(t) ||
    (/\bllc\b/i.test(t) &&
      /\b(?:membership(?:\s+interests?)?|managing\s+member|member[-\s]?managed|members?\s+of\s+(?:the\s+)?(?:llc|limited\s+liability\s+company)|members?\s*:|(?:equity|capital|membership)\s+units?\b|capital\s+contributions?|distributions?)\b/i.test(
        low,
      )) ||
    /\bcompany\s+formation\b/i.test(low) ||
    (/\bllc\b/i.test(t) && /\b(?:governance|company\s+operating)\b/i.test(low))
  ) {
    return "operating_agreement";
  }

  const primaryServiceIntent =
    /\bconsult(?:ant|ing)\b/i.test(low) ||
    /\badvisor(?:y|s)?\b/i.test(low) ||
    /\bretainer\b/i.test(low) ||
    /\bservices?\s+agreement\b/i.test(low) ||
    /\bscope\s+of\s+work\b/i.test(low) ||
    /\b(?:saas|msa|master\s+service)\b/i.test(low) ||
    /\bindependent\s+contractor\b/i.test(low) ||
    /\b(?:web|software|app|mobile|platform)\s+develop(?:ment|er)?\b/i.test(low) ||
    /\bdevelopment\s+agreement\b/i.test(low) ||
    /\b(?:freelance|contract)\s+(?:work|project|engagement)\b/i.test(low) ||
    /\bvendor\b/i.test(low) ||
    /\bsubcontract(?:or|ing)?\b/i.test(low) ||
    /\bstatement\s+of\s+work\b/i.test(low) ||
    /\b(?:design|creative|marketing|branding)\s+(?:services?|agreement|contract)\b/i.test(low) ||
    /\bcollaboration\s+agreement\b/i.test(low) ||
    /\bjoint\s+venture\b/i.test(low) ||
    /\b(?:monthly|weekly|hourly)\s+(?:rate|fee|retainer)\b/i.test(low) ||
    /\bdeliverables?\b/i.test(low);

  /**
   * Pure NDA archetype short-circuit: when intake clearly says NDA / Non-Disclosure / Mutual NDA
   * AND there is NO scope-of-work, payment, deliverable, or service-fee structure described,
   * route as `nda` regardless of incidental "evaluation" / "collaboration" / "services" mentions.
   */
  const explicitlyNdaTitle =
    /\bmutual\s+(?:nda|non[-\s]?disclosure)\b/i.test(low) ||
    /\bmutual\s+confidentiality\s+agreement\b/i.test(low) ||
    /\b(?:non[-\s]?disclosure|nda)\s+(?:agreement|between|among)\b/i.test(low) ||
    /^\s*(?:mutual\s+)?(?:nda|non[-\s]?disclosure)\b[.:]/i.test(t);
  const lacksCommercialStructure =
    !/\$\s*\d/i.test(low) &&
    !/\b\d+\s*(?:\/|per)\s*(?:hour|hr|month|mo|year|day|visit)\b/i.test(low) &&
    !/\bscope\s+of\s+work\b/i.test(low) &&
    !/\bdeliverable/i.test(low) &&
    !/\bstatement\s+of\s+work\b/i.test(low) &&
    !/\bmonthly\s+retainer\b/i.test(low);
  if (explicitlyNdaTitle && lacksCommercialStructure) {
    return "nda";
  }

  if ((ndaDominant || /\bconfidentiality\s+agreement\b/i.test(t)) && !primaryServiceIntent) {
    return "nda";
  }

  if (commercialSignals.nda && ndaHybridSignals && !primaryServiceIntent) {
    return "confidentiality_commercial_protections_agreement";
  }

  /**
   * Explicit non-service intent (P1 universal hardening): when intake plainly says
   * "lease agreement" / "purchase agreement" / "property management agreement" /
   * "co-ownership agreement" / "employment agreement" / "license agreement" /
   * "partnership agreement" / "distribution agreement" / "joint venture agreement",
   * route to the catch-all generic family so {@link explicitIntentCanonicalTitle}
   * can render the canonical heading. This must beat incidental "advisor"/"services"
   * tokens that show up only inside party names like "Beta Advisors".
   */
  const explicitNonServiceIntent =
    /\b(?:residential|commercial)?\s*lease\s+(?:agreement|contract)\b/i.test(low) ||
    /\bsublease\s+(?:agreement|contract)\b/i.test(low) ||
    /\b(?:real\s+estate\s+)?purchase\s+(?:and\s+sale\s+)?(?:agreement|contract)\b/i.test(low) ||
    /\bproperty\s+management\s+(?:agreement|contract)\b/i.test(low) ||
    /\bco[-\s]?ownership\s+(?:agreement|contract)\b/i.test(low) ||
    /\bemployment\s+(?:agreement|contract)\b/i.test(low) ||
    /\blicense\s+agreement\b/i.test(low) ||
    /\bdistribution\s+agreement\b/i.test(low) ||
    /\bpartnership\s+agreement\b/i.test(low) ||
    /\bjoint\s+venture\s+agreement\b/i.test(low) ||
    /\bequipment\s+(?:rental|lease)\s+agreement\b/i.test(low);
  if (explicitNonServiceIntent) {
    return "generic_business_agreement";
  }

  /**
   * Explicit "<type> Agreement" titles dominate role-token noise inside party names.
   * E.g. "Services agreement between Beta Advisors LLC, …" must route to services,
   * not consulting, even though "Advisors" appears in a party name.
   */
  if (/\bservices?\s+(?:agreement|contract)\b/i.test(low)) {
    return "services_agreement";
  }
  if (/\bconsulting\s+(?:agreement|contract)\b/i.test(low)) {
    return "consulting_agreement";
  }
  if (/\b(?:advisor(?:y|s)?\s+(?:agreement|contract)|board\s+advisor)\b/i.test(low)) {
    return "consulting_agreement";
  }
  if (/\bindependent\s+contractor\s+(?:agreement|contract)\b/i.test(low) || /\b1099\s+(?:agreement|contract)\b/i.test(low)) {
    return "independent_contractor_agreement";
  }

  if (
    commercialSignals.contractorLike &&
    (commercialSignals.servicesLike || commercialSignals.commission || /\b(statement\s+of\s+work|sow)\b/i.test(low))
  ) {
    return "independent_contractor_agreement";
  }

  if (
    commercialSignals.referralLike &&
    (commercialSignals.commission || commercialSignals.exclusivityLike || /\bnon[-\s]?circumvent|non[-\s]?solicit\b/i.test(low))
  ) {
    return "services_agreement";
  }

  if (/\bindependent\s+contractor\b/i.test(low) || (/\b1099\b/i.test(t) && /\bagreement\b/i.test(low))) {
    return "independent_contractor_agreement";
  }

  if (
    /\bconsult(?:ant|ing)\b/i.test(low) ||
    /\badvisor(?:y|s)?\b/i.test(low) ||
    /\bretainer\b/i.test(low)
  ) {
    return "consulting_agreement";
  }

  if (
    /\b(?:saas|msa|master\s+service)\b/i.test(low) ||
    /\bservices?\s+agreement\b/i.test(low) ||
    /\bscope\s+of\s+work\b/i.test(low)
  ) {
    return "services_agreement";
  }

  return "generic_business_agreement";
}

export function needsServiceBilateralSmartDefaults(family: AgreementFamily): boolean {
  return (
    family === "consulting_agreement" ||
    family === "services_agreement" ||
    family === "independent_contractor_agreement"
  );
}

/** API `agreement_family_hint` from premium parse → local family. */
const FAMILY_HINT_MAP: Record<string, AgreementFamily> = {
  generic: "generic_business_agreement",
  nda: "nda",
  operating_agreement: "operating_agreement",
  services: "services_agreement",
  partnership: "services_agreement",
  family_financial: "generic_business_agreement",
};

/**
 * Resolves a premium `agreement_family_hint` string to `AgreementFamily`, or null if unknown.
 */
export function mapAgreementFamilyHint(hint: string | null | undefined): AgreementFamily | null {
  if (hint == null) return null;
  const k = String(hint).trim().toLowerCase();
  return FAMILY_HINT_MAP[k] ?? null;
}

/**
 * `detected` is from local `detectAgreementFamily`. `hint` is from premium parse extract.
 * High-confidence detections (operating, NDA) are never overridden by a hint.
 */
export function mergeAgreementFamily(
  detected: AgreementFamily,
  hint: string | null | undefined,
  _intake: string,
): AgreementFamily {
  if (detected === "operating_agreement" || detected === "nda") {
    return detected;
  }
  const mapped = mapAgreementFamilyHint(hint);
  if (mapped) {
    return mapped;
  }
  return detected;
}
