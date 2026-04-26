import type { AgreementIntentContract } from "./agreementIntentContract";

export type PremiumIntentTier = "A" | "B" | "unknown";

export type PremiumIntentPreflightPolicy = {
  tier: PremiumIntentTier;
  preferCompactStructuredServerDraft: boolean;
  preferNeedsDetailsForWeakDraft: boolean;
  askMissingFactsEarlier: boolean;
};

export function resolvePremiumIntentPreflightPolicy(
  contract: AgreementIntentContract | null | undefined,
): PremiumIntentPreflightPolicy {
  const id = contract?.intent_id || "custom_unknown";
  if (
    id === "design_creative" ||
    id === "consulting_services" ||
    id === "nda_confidentiality" ||
    id === "software_web_dev"
  ) {
    return {
      tier: "A",
      preferCompactStructuredServerDraft: true,
      preferNeedsDetailsForWeakDraft: false,
      askMissingFactsEarlier: false,
    };
  }
  if (id === "founder_equity_vesting") {
    return {
      tier: "B",
      preferCompactStructuredServerDraft: false,
      preferNeedsDetailsForWeakDraft: true,
      askMissingFactsEarlier: true,
    };
  }
  return {
    tier: "unknown",
    preferCompactStructuredServerDraft: false,
    preferNeedsDetailsForWeakDraft: false,
    askMissingFactsEarlier: false,
  };
}

export function shouldEarlyNeedsDetailsForTierB(args: {
  policy: PremiumIntentPreflightPolicy;
  generationOutcome?: "ok" | "needs_details" | "degraded";
  missingMaterialInfo?: string[] | null | undefined;
}): boolean {
  if (args.policy.tier !== "B") return false;
  if (!args.policy.askMissingFactsEarlier) return false;
  if (args.generationOutcome === "degraded") return false;
  if (args.generationOutcome === "needs_details") return true;
  const missing = (args.missingMaterialInfo || []).map((x) => (x || "").trim()).filter(Boolean);
  return missing.length > 0;
}
