/**
 * Server-authoritative billing status and Customer Portal session.
 * Org and Stripe customer are derived on the server — never sent by the caller.
 */

import { apiUrl, errorMessageFromResponse, logClawClientWarning, readJson } from "../lib/clawApi";
import { featureFlags } from "../config/featureFlags";
import { getAuthSession } from "../auth/supabaseAuthService";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";

export const BILLING_DISPLAY_STATES = [
  "no_subscription",
  "active",
  "scheduled_cancellation",
  "expired_canceled",
  "payment_problem",
  "unavailable",
] as const;

export type BillingDisplayState = (typeof BILLING_DISPLAY_STATES)[number];

export type BillingStatusPayload = {
  org_id: string;
  display_state: BillingDisplayState;
  entitled: boolean;
  plan_code: string | null;
  plan_label: string | null;
  status: string | null;
  billing_interval: "month" | "year" | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  has_stripe_customer: boolean;
  stripe_configured: boolean;
  manage_available: boolean;
};

export type BillingStatusFetch = {
  data: BillingStatusPayload | null;
  error: string | null;
  code: string | null;
  authFailure?: boolean;
  anonymousExpected?: boolean;
  unavailable?: boolean;
};

export type BillingPortalSessionResponse = {
  ok: boolean;
  session_id: string;
  portal_url: string;
  org_id?: string;
  return_url?: string;
};

async function billingAuthHeaders(contentType = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(clawAgreementHeaders() as Record<string, string>),
  };
  if (contentType) headers["Content-Type"] = "application/json";
  const session = await getAuthSession();
  const token = session?.access_token?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function isKnownBillingDisplayState(value: unknown): value is BillingDisplayState {
  return BILLING_DISPLAY_STATES.includes(value as BillingDisplayState);
}

export async function fetchBillingStatus(): Promise<BillingStatusFetch> {
  if (!featureFlags.serverBilling) {
    return { data: null, error: null, code: null, unavailable: true };
  }
  try {
    const session = await getAuthSession();
    if (!session?.access_token?.trim()) {
      return { data: null, error: null, code: null, anonymousExpected: true };
    }
    const res = await fetch(apiUrl("/v1/billing/status"), {
      headers: await billingAuthHeaders(),
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      const msg = await errorMessageFromResponse(res, `Could not load billing (HTTP ${res.status}).`);
      logClawClientWarning("billing.status", { status: res.status });
      return { data: null, error: msg, code: res.status === 403 ? "wrong_org" : "unauthorized", authFailure: true };
    }
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `Could not load billing (HTTP ${res.status}).`);
      logClawClientWarning("billing.status", { status: res.status });
      return { data: null, error: msg, code: "unavailable", unavailable: true };
    }
    const data = await readJson<BillingStatusPayload>(res);
    if (!data || !isKnownBillingDisplayState(data.display_state) || !data.org_id) {
      return { data: null, error: "Billing status was incomplete.", code: "unavailable", unavailable: true };
    }
    return { data, error: null, code: null };
  } catch (e) {
    logClawClientWarning("billing.status", { error: String(e) });
    return {
      data: null,
      error: "Could not reach the server — check that the API is running.",
      code: "unavailable",
      unavailable: true,
    };
  }
}

export async function createBillingPortalSession(args?: {
  returnTo?: string;
}): Promise<BillingPortalSessionResponse> {
  const res = await fetch(apiUrl("/v1/billing/portal-session"), {
    method: "POST",
    headers: await billingAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify({
      return_to: args?.returnTo?.trim() || "/app/billing",
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not open billing management."));
  }
  return (await readJson<BillingPortalSessionResponse>(res)) as BillingPortalSessionResponse;
}
