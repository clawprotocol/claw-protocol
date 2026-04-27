import { trackAgreementFunnelEvent } from "../../tracking/agreementFunnelAnalytics";
import type { UpgradeCheckoutContextV1 } from "./upgradeCheckoutContextStorage";

export function resolveStarterProRefineCheckoutSuccessEventName(
  ctx: Pick<UpgradeCheckoutContextV1, "starterProRefineCtaExperiment"> | null,
):
  | "starter_pro_refine_control_checkout_success"
  | "starter_pro_refine_variant_checkout_success"
  | null {
  const e = ctx?.starterProRefineCtaExperiment;
  if (e === "control") return "starter_pro_refine_control_checkout_success";
  if (e === "variant") return "starter_pro_refine_variant_checkout_success";
  return null;
}

/**
 * On successful create-flow Pro checkout, if the user stashed a Starter Pro Refine CTA
 * experiment arm in {@link upgradeCheckoutContextStorage}, emit the matching success event once.
 */
export function trackStarterProRefineCheckoutSuccessFromContext(
  ctx: UpgradeCheckoutContextV1 | null,
  planTier: string,
): void {
  const name = resolveStarterProRefineCheckoutSuccessEventName(ctx);
  if (!name) return;
  trackAgreementFunnelEvent(name, { surface: "create_flow_checkout" }, { planTier });
}
