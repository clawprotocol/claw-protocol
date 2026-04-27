import { STARTER_PRO_REFINE_UPSELL_CTA, STARTER_PRO_REFINE_UPSELL_CTA_EXPERIMENT_VARIANT } from "./reviewRefineUserCopy";

export type StarterProRefineCtaExperiment = "control" | "variant";

export type StarterProRefineImpressionFunnelEventName =
  | "starter_pro_refine_control_impression"
  | "starter_pro_refine_variant_impression";

/** @internal exported for unit tests */
export function parseStarterProRefineCtaExperimentEnv(
  raw: string | null | undefined,
): StarterProRefineCtaExperiment {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "variant" || s === "upgrade" || s === "1" || s === "true") {
    return "variant";
  }
  return "control";
}

/**
 * A/B for analytics; UI uses fixed “Upgrade to improve draft” on the create-flow card.
 * Set `VITE_CLAW_STARTER_PRO_REFINE_CTA_EXPERIMENT=variant` to tag variant for funnel events.
 */
export function getStarterProRefineCtaExperiment(): StarterProRefineCtaExperiment {
  return parseStarterProRefineCtaExperimentEnv(
    (import.meta as unknown as { env?: { VITE_CLAW_STARTER_PRO_REFINE_CTA_EXPERIMENT?: string } }).env
      ?.VITE_CLAW_STARTER_PRO_REFINE_CTA_EXPERIMENT,
  );
}

export function starterProRefineUpsellCtaLabel(experiment: StarterProRefineCtaExperiment): string {
  return experiment === "variant" ? STARTER_PRO_REFINE_UPSELL_CTA_EXPERIMENT_VARIANT : STARTER_PRO_REFINE_UPSELL_CTA;
}

export function starterProRefineImpressionFunnelEvent(
  e: StarterProRefineCtaExperiment,
): StarterProRefineImpressionFunnelEventName {
  return e === "variant" ? "starter_pro_refine_variant_impression" : "starter_pro_refine_control_impression";
}
