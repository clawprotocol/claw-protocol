import { apiUrl, errorMessageFromResponse } from "../../lib/clawApi";
import { getAuthSession } from "../../auth/supabaseAuthService";
import type { GenesisReferralCheckoutPayload } from "./genesisReferralCapture";

async function genesisAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra ?? {}),
  };
  const session = await getAuthSession();
  const token = session?.access_token?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function postGenesisReferralCapture(args: {
  referral_code: string;
  visitor_id: string;
  source_path?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl("/v1/genesis-referral/capture"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await errorMessageFromResponse(res, "Capture failed") };
  } catch {
    return { ok: false, error: "Could not reach referral service." };
  }
}

export async function postGenesisReferralConvert(args: {
  referral_code: string;
  visitor_id: string;
  referred_org_id?: string;
  referred_user_id?: string;
}): Promise<{ ok: boolean; error?: string; blocked?: boolean }> {
  try {
    const res = await fetch(apiUrl("/v1/genesis-referral/convert"), {
      method: "POST",
      headers: await genesisAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(args),
    });
    if (res.ok) return { ok: true };
    const err = await errorMessageFromResponse(res, "Conversion failed");
    return { ok: false, error: err, blocked: res.status === 409 };
  } catch {
    return { ok: false, error: "Could not reach referral service." };
  }
}

function genesisCheckoutMetadataFallback(
  orgId: string,
  payload: GenesisReferralCheckoutPayload,
  userId?: string,
): Record<string, string> {
  const out: Record<string, string> = {
    org_id: orgId,
    claw_org_id: orgId,
    plan_code: "pro",
    visitor_id: payload.visitor_id,
  };
  if (payload.referral_code) {
    out.referral_code = payload.referral_code;
  }
  if (userId) {
    out.user_id = userId;
  }
  return out;
}

export async function fetchGenesisCheckoutMetadata(
  orgId: string,
  payload: GenesisReferralCheckoutPayload,
  userId?: string,
): Promise<Record<string, string>> {
  const fallback = genesisCheckoutMetadataFallback(orgId, payload, userId);
  try {
    const res = await fetch(apiUrl("/v1/genesis-referral/checkout-metadata"), {
      method: "POST",
      headers: await genesisAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        org_id: orgId,
        referral_code: payload.referral_code ?? undefined,
        visitor_id: payload.visitor_id,
        user_id: userId,
        plan_code: "pro",
      }),
    });
    if (!res.ok) {
      return fallback;
    }
    const data = (await res.json()) as { metadata?: Record<string, string> };
    return data.metadata ?? fallback;
  } catch {
    return fallback;
  }
}

export type GenesisAffiliateDashboard = {
  ok: boolean;
  affiliate?: {
    referral_code: string;
    display_name: string;
    payout_rate: number;
    affiliate_status: string;
  };
  referral_link_path?: string;
  converted_referrals?: number;
  active_referred_subscriptions?: number;
  pending_commission_usd?: number;
  payable_commission_usd?: number;
  paid_commission_usd?: number;
  error?: string;
};

export type GenesisAffiliateAccess = {
  ok: boolean;
  allowed: boolean;
  reason?: string;
};

/** Authenticated probe — active Genesis Dog only; no commission payload. */
export async function fetchGenesisAffiliateAccess(): Promise<GenesisAffiliateAccess> {
  try {
    const headers = await genesisAuthHeaders();
    if (!headers.Authorization) {
      return { ok: true, allowed: false, reason: "genesis_affiliate_access_denied" };
    }
    const res = await fetch(apiUrl("/v1/genesis-referral/affiliate/access"), {
      headers,
      credentials: "include",
    });
    if (!res.ok) {
      return { ok: true, allowed: false, reason: "genesis_affiliate_access_denied" };
    }
    const data = (await res.json()) as GenesisAffiliateAccess;
    return {
      ok: true,
      allowed: Boolean(data.allowed),
      reason: data.allowed ? undefined : data.reason || "genesis_affiliate_access_denied",
    };
  } catch {
    return { ok: true, allowed: false, reason: "genesis_affiliate_access_denied" };
  }
}

export async function fetchGenesisAffiliateDashboard(): Promise<GenesisAffiliateDashboard> {
  try {
    const headers = await genesisAuthHeaders();
    if (!headers.Authorization) {
      return { ok: false, error: "genesis_affiliate_access_denied" };
    }
    const res = await fetch(apiUrl("/v1/genesis-referral/affiliate/me"), {
      headers,
      credentials: "include",
    });
    if (!res.ok) {
      return { ok: false, error: await errorMessageFromResponse(res, "genesis_affiliate_access_denied") };
    }
    return (await res.json()) as GenesisAffiliateDashboard;
  } catch {
    return { ok: false, error: "Could not load dashboard." };
  }
}
