import type { AgreementFamily } from "./agreementFamilyRouter";

/**
 * Map free-text family label from the premium full-draft model to our routing enum.
 */
export function mapPremiumFullDraftFamilyHint(
  hint: string,
  fallback: AgreementFamily | undefined,
): AgreementFamily | undefined {
  const t = (hint || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return fallback;
  if (/\boperating\s+agreement\b|multimember|member[-\s]managed|llc\s+operating\b/.test(t)) {
    return "operating_agreement";
  }
  if (/\b(?:ai|artificial\s+intelligence)\b/.test(t) && /\b(?:software|infrastructure|rollout)\b/.test(t)) {
    return "services_agreement";
  }
  if (/\bnda\b|non[-\s]?disclosure|confidentiality\s+and\s+commercial|commercial\s+protections/.test(t)) {
    if (
      fallback === "services_agreement" ||
      fallback === "consulting_agreement" ||
      fallback === "independent_contractor_agreement"
    ) {
      return fallback;
    }
    if (
      /\bcommercial|services|ip|work\s+product|referral|contractor/.test(t) &&
      !/\b(saas|reseller|white[-\s]?label|software\s+services|implementation|integration)\b/.test(t)
    ) {
      return "confidentiality_commercial_protections_agreement";
    }
    return "nda";
  }
  if (/\b1099|independent\s+contractor|freelance|contractor\s+agreement/.test(t)) {
    return "independent_contractor_agreement";
  }
  if (/\bconsult/.test(t)) {
    return "consulting_agreement";
  }
  if (/\breferral|channel\s+partner|commission|rev(?:enue)?\s*share|affiliate|influencer|marketing|agency|retainer|services/.test(
    t,
  )) {
    return "services_agreement";
  }
  return fallback;
}
