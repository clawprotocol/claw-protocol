import type { AccessTier, AiModelClass, TierEntitlements } from "./types";

/**
 * Central entitlement definitions — adjust caps here only.
 * `null` numeric limits mean unlimited.
 */
export const TIER_CONFIG: Record<AccessTier, TierEntitlements> = {
  free: {
    label: "Free",
    can_create_agreements: true,
    can_use_esign: true,
    max_active_agreements: 5,
    max_recipient_reviews_per_month: 8,
    max_revision_previews_per_month: 10,
    max_signature_requests_per_month: 4,
    max_verification_packets_per_month: 12,
    max_vs01_counterparties: 3,
    effective_ai_model_class: "basic",
    can_use_premium_voice: false,
    can_access_public_verify_branding_controls: false,
  },
  standard: {
    label: "Standard",
    can_create_agreements: true,
    can_use_esign: true,
    max_active_agreements: 25,
    max_recipient_reviews_per_month: 40,
    max_revision_previews_per_month: 60,
    max_signature_requests_per_month: 25,
    max_verification_packets_per_month: 80,
    max_vs01_counterparties: 8,
    effective_ai_model_class: "basic",
    can_use_premium_voice: false,
    can_access_public_verify_branding_controls: false,
  },
  premium: {
    label: "Premium",
    can_create_agreements: true,
    can_use_esign: true,
    max_active_agreements: null,
    max_recipient_reviews_per_month: null,
    max_revision_previews_per_month: null,
    max_signature_requests_per_month: null,
    max_verification_packets_per_month: null,
    max_vs01_counterparties: null,
    effective_ai_model_class: "premium",
    can_use_premium_voice: true,
    can_access_public_verify_branding_controls: true,
  },
  admin: {
    label: "Admin",
    can_create_agreements: true,
    can_use_esign: true,
    max_active_agreements: null,
    max_recipient_reviews_per_month: null,
    max_revision_previews_per_month: null,
    max_signature_requests_per_month: null,
    max_verification_packets_per_month: null,
    max_vs01_counterparties: null,
    effective_ai_model_class: "premium",
    can_use_premium_voice: true,
    can_access_public_verify_branding_controls: true,
  },
};

/** Declarative mapping for docs / future resolver wiring (sources not implemented yet). */
export const ENTITLEMENT_SOURCE_PLACEHOLDERS = [
  "local_dev_override",
  "backend_user_record",
  "payment_subscription",
  "claw_key_wallet",
  "affiliate_credit",
] as const;

export function tierEntitlements(tier: AccessTier): TierEntitlements {
  return TIER_CONFIG[tier] ?? TIER_CONFIG.free;
}

export function planDisplayName(tier: AccessTier): string {
  return tierEntitlements(tier).label;
}

export function allowedAiModelClassForTier(tier: AccessTier): AiModelClass {
  return tierEntitlements(tier).effective_ai_model_class;
}
