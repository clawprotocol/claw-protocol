import { apiUrl, errorMessageFromResponse, logClawClientWarning, readJson } from "../lib/clawApi";
import { featureFlags } from "../config/featureFlags";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getAuthSession } from "../auth/supabaseAuthService";

export type KeyBalanceResponse = {
  org_id?: string;
  keys_available?: number;
  keys_reserved?: number;
  updated_at?: string;
};

export type SubscriptionRow = {
  id?: string;
  org_id?: string;
  plan_code?: string;
  status?: string;
  payment_id?: string;
  created_at?: string;
};

export type KeyBalanceFetch = {
  data: KeyBalanceResponse | null;
  error: string | null;
};

export type SubscriptionFetch = {
  data: SubscriptionRow | null;
  error: string | null;
  /** True when the server explicitly reported no subscription (HTTP 404 or null body). */
  noSubscription: boolean;
};

export async function fetchKeyBalance(orgId: string): Promise<KeyBalanceFetch> {
  if (!featureFlags.serverBilling) return { data: null, error: null };
  const oid = (orgId || "").trim();
  if (!oid) return { data: null, error: "Set a workspace org id on the billing page." };
  try {
    const res = await fetch(apiUrl(`/v1/orgs/${encodeURIComponent(oid)}/keys`), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `Could not load keys (HTTP ${res.status}).`);
      logClawClientWarning("billing.keys", { status: res.status, orgId: oid });
      return { data: null, error: msg };
    }
    const data = await readJson<KeyBalanceResponse>(res);
    return { data, error: null };
  } catch (e) {
    logClawClientWarning("billing.keys", { error: String(e) });
    return { data: null, error: "Could not reach the server — check that the API is running." };
  }
}

export async function fetchSubscription(orgId: string): Promise<SubscriptionFetch> {
  if (!featureFlags.serverBilling) return { data: null, error: null, noSubscription: false };
  const oid = (orgId || "").trim();
  if (!oid) return { data: null, error: null, noSubscription: false };
  try {
    const session = await getAuthSession();
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(clawAgreementHeaders() as Record<string, string>),
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    const res = await fetch(apiUrl(`/v1/subscriptions/${encodeURIComponent(oid)}`), {
      headers,
      credentials: "include",
    });
    if (res.status === 404) return { data: null, error: null, noSubscription: true };
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `Could not load subscription (HTTP ${res.status}).`);
      logClawClientWarning("billing.subscription", { status: res.status, orgId: oid });
      return { data: null, error: msg, noSubscription: false };
    }
    const j = await readJson<{ subscription?: SubscriptionRow | null }>(res);
    const row = j.subscription ?? null;
    return { data: row, error: null, noSubscription: !row };
  } catch (e) {
    logClawClientWarning("billing.subscription", { error: String(e) });
    return { data: null, error: "Could not reach the server — check that the API is running.", noSubscription: false };
  }
}
