import { apiUrl, errorMessageFromResponse } from "../../lib/clawApi";
import type { GenesisReferralCheckoutPayload } from "./genesisReferralCapture";

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (res.ok) return { ok: true };
    const err = await errorMessageFromResponse(res, "Conversion failed");
    return { ok: false, error: err, blocked: res.status === 409 };
  } catch {
    return { ok: false, error: "Could not reach referral service." };
  }
}

export async function fetchGenesisCheckoutMetadata(
  orgId: string,
  payload: GenesisReferralCheckoutPayload,
  userId?: string,
): Promise<Record<string, string>> {
  const body = {
    org_id: orgId,
    referral_code: payload.referral_code ?? undefined,
    visitor_id: payload.visitor_id,
    user_id: userId,
    plan_code: "pro",
  };
  try {
    const res = await fetch(apiUrl("/v1/genesis-referral/checkout-metadata"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return {
        org_id: orgId,
        claw_org_id: orgId,
        plan_code: "pro",
        ...(payload.referral_code ? { referral_code: payload.referral_code } : {}),
        visitor_id: payload.visitor_id,
      };
    }
    const data = (await res.json()) as { metadata?: Record<string, string> };
    return data.metadata ?? body;
  } catch {
    return {
      org_id: orgId,
      claw_org_id: orgId,
      plan_code: "pro",
      ...(payload.referral_code ? { referral_code: payload.referral_code } : {}),
      visitor_id: payload.visitor_id,
    };
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

export async function fetchGenesisAffiliateDashboard(userId: string): Promise<GenesisAffiliateDashboard> {
  try {
    const res = await fetch(apiUrl("/v1/genesis-referral/affiliate/me"), {
      headers: { "X-Claw-User-Id": userId },
    });
    if (!res.ok) {
      return { ok: false, error: await errorMessageFromResponse(res, "Not found") };
    }
    return (await res.json()) as GenesisAffiliateDashboard;
  } catch {
    return { ok: false, error: "Could not load dashboard." };
  }
}
