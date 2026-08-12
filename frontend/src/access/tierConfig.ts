import type { AccessTier, AiModelClass, TierEntitlements } from "./types";

/**
 * Legacy local tier table — paid-beta contract makes backend
 * `resolve_commercial_entitlement` the sole create/capability SoT.
 *
 * These caps are display/fallback only. Do not grant Free create, Plus, or
 * unlimited Pro from this table. Prefer `commercialEntitlement` server decisions.
 *
 * Mapping (legacy AccessTier → contract ladder):
 * - free → Guest-equivalent (no persisted create)
 * - standard → retired Plus SKU (no create; upgrade to Pro)
 * - premium → Pro ($49 / 10 successfully finalized agreements per billing period)
 * - admin → operator override
 */
export const TIER_CONFIG: Record<AccessTier, TierEntitlements> = {
  free: {
    label: "Guest",
    can_create_agreements: false,
    can_use_esign: false,
    max_active_agreements: 1,
    max_recipient_reviews_per_month: 0,
    max_revision_previews_per_month: 0,
    max_signature_requests_per_month: 0,
    max_verification_packets_per_month: 0,
    max_vs01_counterparties: 0,
    effective_ai_model_class: "basic",
    can_use_premium_voice: false,
    can_access_public_verify_branding_controls: false,
  },
  standard: {
    label: "Retired (use Genesis or Pro)",
    can_create_agreements: false,
    can_use_esign: false,
    max_active_agreements: 0,
    max_recipient_reviews_per_month: 0,
    max_revision_previews_per_month: 0,
    max_signature_requests_per_month: 0,
    max_verification_packets_per_month: 0,
    max_vs01_counterparties: 0,
    effective_ai_model_class: "basic",
    can_use_premium_voice: false,
    can_access_public_verify_branding_controls: false,
  },
  premium: {
    label: "Pro",
    can_create_agreements: true,
    can_use_esign: true,
    max_active_agreements: 25,
    max_recipient_reviews_per_month: 25,
    max_revision_previews_per_month: 25,
    max_signature_requests_per_month: 25,
    max_verification_packets_per_month: 25,
    max_vs01_counterparties: 25,
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
