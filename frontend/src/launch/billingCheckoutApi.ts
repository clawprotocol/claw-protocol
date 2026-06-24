/**
 * Stripe Checkout Session API client.
 */

import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { getOrgId } from "../launch/orgContext";
import { getAffiliateCodeForAttribution } from "../launch/affiliate/affiliateAttributionContext";

export type CheckoutSessionResponse = {
  ok: boolean;
  session_id: string;
  checkout_url: string;
};

export type VerifyCheckoutSessionResponse = {
  ok: boolean;
  subscription?: {
    plan_code?: string;
    status?: string;
  };
};

export function isStripeCheckoutApiConfigured(): boolean {
  try {
    return String(import.meta.env.VITE_CLAW_FEATURE_STRIPE_CHECKOUT || "").trim() === "1";
  } catch {
    return false;
  }
}

export async function createBillingCheckoutSession(args: {
  agreementId: string;
  cadence: "monthly" | "annual";
  returnTo: string;
  userId?: string | null;
  customerEmail?: string | null;
  referralCode?: string | null;
  visitorId?: string | null;
}): Promise<CheckoutSessionResponse> {
  const res = await fetch(apiUrl("/v1/billing/checkout-session"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      org_id: getOrgId(),
      agreement_id: args.agreementId,
      cadence: args.cadence,
      return_to: args.returnTo,
      user_id: args.userId ?? undefined,
      customer_email: args.customerEmail ?? undefined,
      referral_code: args.referralCode ?? getAffiliateCodeForAttribution() ?? undefined,
      visitor_id: args.visitorId ?? undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not start checkout."));
  }
  return (await readJson<CheckoutSessionResponse>(res)) as CheckoutSessionResponse;
}

export async function verifyBillingCheckoutSession(sessionId: string): Promise<VerifyCheckoutSessionResponse> {
  const res = await fetch(apiUrl("/v1/billing/verify-checkout-session"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ session_id: sessionId, org_id: getOrgId() }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not verify checkout."));
  }
  return (await readJson<VerifyCheckoutSessionResponse>(res)) as VerifyCheckoutSessionResponse;
}

export async function demoActivateSubscription(args: {
  userId: string;
  orgId: string;
}): Promise<VerifyCheckoutSessionResponse> {
  const res = await fetch(apiUrl("/v1/workspace/demo-activate-subscription"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      user_id: args.userId,
      previous_org_id: args.orgId,
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not activate demo subscription."));
  }
  return (await readJson<VerifyCheckoutSessionResponse>(res)) as VerifyCheckoutSessionResponse;
}
