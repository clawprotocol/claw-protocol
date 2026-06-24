/**
 * Optional server subscription sync after dev/QA checkout bypass — never on production Stripe paths.
 */

import { featureFlags } from "../config/featureFlags";
import {
  isDevCreateFlowPaymentBypassEnabled,
} from "./devPaymentBypass";
import { isStripeCheckoutApiConfigured, demoActivateSubscription } from "./billingCheckoutApi";
import { refreshSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { isLocalBrowserOrigin } from "../lib/clawApi";

export type DemoSubscriptionSyncArgs = {
  userId: string;
  orgId: string;
  devBypass?: boolean;
  qaBypass?: boolean;
  localDemoCard?: boolean;
};

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env.MODE === "test";
}

function debugDemoSubscriptionSync(message: string, detail?: Record<string, unknown>): void {
  if (isTestMode()) return;
  if (import.meta.env.DEV || import.meta.env.VITE_CLAW_LOG_API_BASE === "1") {
    // eslint-disable-next-line no-console
    console.debug(`[demo-subscription-sync] ${message}`, detail ?? {});
  }
}

/**
 * True when checkout used a local/dev non-Stripe path that may sync server subscription.
 * QA bypass on staging/production hosts uses session markers only — no server POST.
 */
export function shouldSyncDemoSubscriptionEntitlementAfterCheckout(
  args?: Pick<DemoSubscriptionSyncArgs, "devBypass" | "localDemoCard">,
): boolean {
  if (!featureFlags.serverBilling) return false;
  if (isStripeCheckoutApiConfigured()) return false;
  const devBypass = args?.devBypass ?? isDevCreateFlowPaymentBypassEnabled();
  const localDemoCard = args?.localDemoCard ?? isLocalBrowserOrigin();
  return devBypass || localDemoCard;
}

/**
 * Sync Pro subscription on the server for dev/QA/local demo checkout only.
 * Skips silently when not applicable; failures are debug-logged and never block checkout return.
 */
export async function syncDemoSubscriptionEntitlementIfApplicable(
  args: DemoSubscriptionSyncArgs,
): Promise<void> {
  const devBypass = args.devBypass ?? false;
  const qaBypass = args.qaBypass ?? false;
  const localDemoCard = args.localDemoCard ?? false;
  if (qaBypass) {
    debugDemoSubscriptionSync("skipped", {
      reason: "qa_bypass_uses_session_entitlement_only",
      qaBypass,
    });
    return;
  }
  if (
    !shouldSyncDemoSubscriptionEntitlementAfterCheckout({
      devBypass,
      localDemoCard,
    })
  ) {
    debugDemoSubscriptionSync("skipped", {
      reason: "not_dev_qa_or_local_demo",
      devBypass,
      qaBypass,
      localDemoCard,
    });
    return;
  }
  try {
    await demoActivateSubscription({ userId: args.userId, orgId: args.orgId });
    await refreshSubscriptionEntitlement(args.orgId);
    debugDemoSubscriptionSync("ok", { orgId: args.orgId });
  } catch (err) {
    debugDemoSubscriptionSync("optional_sync_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
