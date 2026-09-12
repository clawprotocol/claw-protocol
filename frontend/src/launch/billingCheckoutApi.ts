/**
 * Stripe Checkout Session API client.
 */

import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { getAffiliateCodeForAttribution } from "../launch/affiliate/affiliateAttributionContext";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { setCachedAccessToken } from "../auth/authAccessTokenCache";
import { getAuthSession } from "../auth/supabaseAuthService";

export type CheckoutSessionResponse = {
  ok: boolean;
  session_id: string;
  checkout_url: string;
  org_id?: string;
};

export type VerifyCheckoutSessionResponse = {
  ok: boolean;
  subscription?: {
    plan_code?: string;
    status?: string;
  };
};

export type BillingCheckoutStartError = Error & { code?: string };

export function checkoutStartErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "").trim();
  }
  return "";
}

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
  customerEmail?: string | null;
  referralCode?: string | null;
  visitorId?: string | null;
}): Promise<CheckoutSessionResponse> {
  const session = await getAuthSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(clawAgreementHeaders() as Record<string, string>),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(apiUrl("/v1/billing/checkout-session"), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      agreement_id: args.agreementId,
      cadence: args.cadence,
      return_to: args.returnTo,
      customer_email: args.customerEmail ?? undefined,
      referral_code: args.referralCode ?? getAffiliateCodeForAttribution() ?? undefined,
      visitor_id: args.visitorId ?? undefined,
    }),
  });
  if (!res.ok) {
    throw await checkoutStartFailure(res, "Could not start checkout.");
  }
  const body = (await readJson<CheckoutSessionResponse>(res)) as CheckoutSessionResponse;
  if (!body.checkout_url) {
    const err = new Error("Your payment is being processed. Do not pay again.") as BillingCheckoutStartError;
    err.code = "payment_processing";
    throw err;
  }
  return body;
}

async function checkoutStartFailure(res: Response, fallback: string): Promise<BillingCheckoutStartError> {
  const text = (await res.text()).trim();
  let message = fallback;
  let code = "";
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "object" && parsed.detail !== null) {
      const detail = parsed.detail as { code?: unknown; message?: unknown };
      if (typeof detail.code === "string") code = detail.code.trim();
      if (typeof detail.message === "string" && detail.message.trim()) message = detail.message.trim();
    } else if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      message = parsed.detail.trim();
    } else if (typeof parsed.message === "string" && parsed.message.trim()) {
      message = parsed.message.trim();
    }
  } catch {
    if (text) message = text.length > 280 ? `${text.slice(0, 277)}…` : text;
  }
  const err = new Error(message) as BillingCheckoutStartError;
  const lower = `${code} ${message}`.toLowerCase();
  if (code) {
    err.code = code;
  } else if (/purchase_unresolved|could not confirm the previous checkout/.test(lower)) {
    err.code = "purchase_unresolved";
  } else if (/payment_processing|being processed/.test(lower)) {
    err.code = "payment_processing";
  } else if (/already_subscribed|already has an active subscription/.test(lower)) {
    err.code = "already_subscribed";
  } else if (/stripe_checkout_not_configured/.test(lower)) {
    err.code = "stripe_checkout_not_configured";
  }
  return err;
}

export async function verifyBillingCheckoutSession(sessionId: string): Promise<VerifyCheckoutSessionResponse> {
  const session = await getAuthSession();
  if (session?.access_token) {
    setCachedAccessToken(session.access_token);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(clawAgreementHeaders() as Record<string, string>),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(apiUrl("/v1/billing/verify-checkout-session"), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ session_id: sessionId }),
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
