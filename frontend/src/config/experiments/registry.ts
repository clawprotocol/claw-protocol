/**
 * Experiment metadata — disable (`enabled: false`) without deleting code.
 * Conventions: CONTROL_PLANE.md
 */
export const EXPERIMENT_DEFS = {
  home_hero_subtitle: {
    key: "home_hero_subtitle",
    owner: "growth",
    hypothesis: "More concrete subtitle lifts early agreement creation",
    primaryMetric: "agreement_started" as const,
    variants: ["control", "alt_concrete"] as const,
    enabled: true,
  },
  /**
   * Paused while `send_conversion_paywall` runs — avoid concurrent paywall experiments.
   * Re-enable when send modal experiment is off or concluded.
   */
  ready_to_send_cta_framing: {
    key: "ready_to_send_cta_framing",
    owner: "growth",
    hypothesis: "Trial-forward CTA framing affects checkout_started",
    primaryMetric: "checkout_started" as const,
    variants: ["control", "trial_emphasis"] as const,
    enabled: false,
  },
  send_conversion_paywall: {
    key: "send_conversion_paywall",
    owner: "growth",
    hypothesis: "Bundled send-modal copy + hierarchy lifts subscription selection vs one-time",
    primaryMetric: "upgrade_clicked" as const,
    variants: ["control", "v1"] as const,
    enabled: true,
  },
  proof_share_bridge_copy: {
    key: "proof_share_bridge_copy",
    owner: "growth",
    hypothesis: "Shorter bridge body copy lifts affiliate_opportunity_viewed",
    primaryMetric: "affiliate_opportunity_viewed" as const,
    variants: ["control", "short"] as const,
    enabled: false,
  },
} as const;

export type ExperimentKey = keyof typeof EXPERIMENT_DEFS;
