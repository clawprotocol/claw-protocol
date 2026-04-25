/**
 * Release / ops / capability gates only — not copy, not A/B variants.
 * Owner: platform — see CONTROL_PLANE.md
 */
export type FeatureGateKey =
  | "affiliate_opportunity_enabled"
  | "affiliate_leaderboard_enabled"
  | "affiliate_challenges_enabled"
  | "proof_share_bridge_enabled"
  | "annual_default_enabled"
  | "crypto_checkout_enabled";

export type FeatureGateMeta = {
  purpose: string;
  owner: string;
  default: boolean;
  lifespan: "release" | "ops" | "entitlement" | "long_lived" | "experiment_wrapper";
  cleanupNote?: string;
};

export const FEATURE_GATE_REGISTRY: Record<FeatureGateKey, FeatureGateMeta> = {
  affiliate_opportunity_enabled: {
    purpose: "Master switch for /app/opportunity and inbound ref handling",
    owner: "growth",
    default: true,
    lifespan: "release",
    cleanupNote: "Remove when affiliate is always on",
  },
  affiliate_leaderboard_enabled: {
    purpose: "Pack leaderboard block on opportunity screen",
    owner: "growth",
    default: true,
    lifespan: "release",
  },
  affiliate_challenges_enabled: {
    purpose: "Challenge cards on opportunity screen",
    owner: "growth",
    default: true,
    lifespan: "release",
  },
  proof_share_bridge_enabled: {
    purpose: "Post-send / proof bridge card into affiliate",
    owner: "growth",
    default: true,
    lifespan: "release",
  },
  annual_default_enabled: {
    purpose: "Prefer annual cadence as default where product allows",
    owner: "pricing",
    default: false,
    lifespan: "experiment_wrapper",
  },
  crypto_checkout_enabled: {
    purpose: "Reserved — SimpleCheckout is card-only; enable when crypto/hybrid rails are reintroduced in UI",
    owner: "payments",
    default: false,
    lifespan: "ops",
    cleanupNote: "Previously toggled crypto/hybrid tabs; kept for future wiring without changing gate shape",
  },
};
