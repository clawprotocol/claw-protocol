import { apiUrl, errorMessageFromResponse, readJson } from "../../lib/clawApi";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import type { LeaderboardEntry } from "./opportunityTypes";

export type RankMovement = "up" | "down" | "same" | "new";

export type AffiliateLeaderboardApiRow = {
  rank: number;
  affiliate_id: string;
  referral_code: string;
  display_name: string;
  avatar_url: string | null;
  avatar_asset_ref: string | null;
  tagline: string | null;
  tier: string;
  momentum_score: number;
  rank_movement: RankMovement;
  badges: string[];
  streak_days: number;
  best_streak_days?: number;
  stats: {
    qualified_signups: number;
    activated_users: number;
    dormant_signups?: number;
    lifetime_conversions: number;
    retained_conversions: number;
    agreements_influenced: number;
  };
  is_viewer: boolean;
};

export type AffiliateLeaderboardResponse = {
  ok: boolean;
  schema: string;
  leaderboard: AffiliateLeaderboardApiRow[];
  meta?: {
    weights: Record<string, number>;
    tier_thresholds: Record<string, number>;
    trust_factors?: Record<string, number>;
    leaderboard_score_basis?: string;
  };
};

/** Fetches server Momentum leaderboard (org-scoped; requires affiliate program participation). */
export async function fetchAffiliateMomentumLeaderboard(orgId: string, limit = 30): Promise<AffiliateLeaderboardResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  const url = apiUrl(
    `/v1/orgs/${encodeURIComponent(orgId)}/affiliate/gamification/leaderboard?${q}`,
  );
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load leaderboard."));
  const data = await readJson<AffiliateLeaderboardResponse>(res);
  logProductEvent("affiliate_leaderboard_opened", { source: "api", rows: data.leaderboard?.length ?? 0 });
  return data;
}

export type AffiliateCelebrations = {
  badges: { badge_id: string; title: string; description: string; visual: string; unlocked_at: string }[];
  tier_upgrade: { previous_tier: string; new_tier: string } | null;
};

export type AffiliateDashboardResponse = {
  ok: boolean;
  schema: string;
  profile: {
    affiliate_id: string;
    display_name: string;
    referral_code: string;
    avatar_url: string | null;
    avatar_asset_ref: string | null;
    tagline: string | null;
    leaderboard_visible: boolean;
    progression_tier: string;
    momentum_score: number;
    momentum_pending_score?: number;
    leaderboard_score_basis?: string;
    leaderboard_rank: number | null;
    lifetime_conversions: number;
    retained_conversions: number;
    agreements_influenced: number;
    qualified_signups: number;
    activated_users: number;
    dormant_signups?: number;
  };
  streak: {
    current_streak_days: number;
    best_streak_days: number;
    streak_last_meaningful_day_utc: string | null;
    streak_at_risk: boolean;
    streak_at_risk_copy: string | null;
  };
  funnel: Record<string, number>;
  badges_unlocked: {
    badge_id: string;
    title: string;
    description: string;
    visual: string;
    category: string;
    unlocked_at?: string;
  }[];
  recent_wins: { badge_id: string; title: string; visual: string; unlocked_at?: string }[];
  next_milestone: { next_tier: string | null; momentum_to_go: number; threshold: number | null };
  celebrations: AffiliateCelebrations;
  affiliate_program?: {
    status: "regular" | "doginal_verified" | string;
    doginal_verified: boolean;
  };
  personal_links?: {
    at_path: string | null;
    doginal_path: string | null;
  };
  earnings_ledger_usd?: {
    pending_usd: number;
    payable_usd: number;
    paid_usd: number;
  };
  referral_summary?: {
    total_referred_users: number;
    paying_referred_users: number;
  };
  payout_method?: "none" | "usdc_wallet" | string;
  payout_note?: string;
  earnings_timeline?: {
    id: string;
    amount_usd: number;
    status: string;
    earning_type: string;
    created_at?: string;
    unlock_at?: string | null;
    paid_at?: string | null;
    risk_hold: number;
    payout_tx_hash?: string | null;
  }[];
  trust_ledger_v1?: {
    referral_code: string;
    clicks: number;
    signups: number;
    conversions: number;
    pending_this_week_usd: number;
    unpaid_total_usd: number;
    eligible_next_payout: boolean;
    rolling_forward_usd: number;
    payout_threshold_usd: number;
    payout_weekday: string;
    next_payout_window_end_at: string;
    last_payout_at?: string | null;
    lifetime_paid_usd: number;
    earnings_pending_usd: number;
    earnings_payable_usd: number;
    recent_activity: {
      at?: string | null;
      type?: string | null;
      commission_usd: number;
      gross_usd?: number | null;
      status?: string | null;
      batch_id?: string | null;
    }[];
  };
  payout_ui?: {
    policy: { hold_days: number; first_payout_delay_days: number; payout_wallet_cooling_days?: number };
    totals: { total_earned_usd: number; total_paid_usd: number };
    network_display?: {
      chain_id: number;
      slug: string;
      label: string;
      usdc_contract: string;
      explorer_tx_url_template: string;
    };
    payout_wallet_display?: {
      address: string | null;
      configured: boolean;
    };
    payout_status_usd?: {
      pending_usd: number;
      payable_usd: number;
      paid_usd: number;
    };
    next_payout_window_copy: string;
    first_payout_timing_copy: string;
    latest_completed_payout: {
      payout_id: string;
      amount_usd: number;
      paid_at?: string | null;
      tx_hash?: string | null;
      explorer_tx_url?: string | null;
    } | null;
  };
};

export async function patchAffiliatePayoutWallet(
  orgId: string,
  body: { usdc_wallet_address: string | null },
): Promise<AffiliateDashboardResponse> {
  const url = apiUrl(`/v1/orgs/${encodeURIComponent(orgId)}/affiliate/gamification/payout-wallet`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...clawAgreementHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not update payout wallet."));
  return readJson<AffiliateDashboardResponse>(res);
}

export async function fetchAffiliateDashboard(orgId: string): Promise<AffiliateDashboardResponse | null> {
  const url = apiUrl(`/v1/orgs/${encodeURIComponent(orgId)}/affiliate/gamification/dashboard`);
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (res.status === 404) {
    if (import.meta.env.DEV) {
      console.debug("[affiliate] gamification dashboard unavailable (optional)");
    }
    return null;
  }
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load affiliate dashboard."));
  return readJson<AffiliateDashboardResponse>(res);
}

export type AffiliateAccessEligibility = {
  paid_subscriber: boolean;
  manual_approved: boolean;
  can_create_link: boolean;
  has_active_affiliate: boolean;
};

export type AffiliateAccessRequestRow = {
  id: string;
  org_id?: string | null;
  email?: string | null;
  request_type: string;
  doginal_pfp_number?: number | null;
  dao_name?: string | null;
  x_handle?: string | null;
  note?: string | null;
  status: "pending" | "approved" | "declined" | "duplicate" | "spam" | string;
  created_at: string;
  updated_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type AffiliateAccessStatusResponse = {
  ok: boolean;
  eligibility: AffiliateAccessEligibility;
  request: AffiliateAccessRequestRow | null;
};

export type CreateAffiliateAccessRequestBody = {
  request_type: "doginal_holder" | "trait_dao_partner" | "csn_creator_partner" | "other";
  doginal_pfp_number?: number;
  dao_name?: string;
  x_handle?: string;
  email?: string;
  note?: string;
};

export async function fetchAffiliateAccessRequestStatus(): Promise<AffiliateAccessStatusResponse> {
  const url = apiUrl("/v1/affiliates/access-request/status");
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load affiliate access status."));
  return readJson<AffiliateAccessStatusResponse>(res);
}

export async function createAffiliateAccessRequest(body: CreateAffiliateAccessRequestBody): Promise<{
  ok: boolean;
  created: boolean;
  request: AffiliateAccessRequestRow | null;
}> {
  const url = apiUrl("/v1/affiliates/access-request");
  const res = await fetch(url, {
    method: "POST",
    headers: { ...clawAgreementHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not submit affiliate access request."));
  return readJson(res);
}

export async function createAffiliateLink(requestedHandle: string): Promise<{
  ok: boolean;
  created: boolean;
  affiliate: Record<string, unknown> | null;
  referral: { canonical_at_path?: string };
}> {
  const url = apiUrl("/v1/affiliates/create-link");
  const res = await fetch(url, {
    method: "POST",
    headers: { ...clawAgreementHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ requested_handle: requestedHandle }),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not create referral link."));
  return readJson(res);
}

/** Maps API rows into existing leaderboard UI shape + Momentum fields. */
export function mapApiLeaderboardToEntries(rows: AffiliateLeaderboardApiRow[]): LeaderboardEntry[] {
  return rows.map((r) => ({
    rank: r.rank,
    referralId: r.affiliate_id,
    displayHandle: r.display_name,
    packTier: (r.tier || "Starter").trim(),
    agreementsInfluenced: r.stats.agreements_influenced,
    keysGenerated: Math.round(r.momentum_score),
    earningsUsd: null,
    showEarningsColumn: false,
    isCurrentUser: r.is_viewer,
    rowKind: "live_peer",
    momentumScore: r.momentum_score,
    rankMovement: r.rank_movement,
    avatarUrl: r.avatar_url,
    avatarAssetRef: r.avatar_asset_ref,
    badgeIds: r.badges,
    streakDays: r.streak_days,
    bestStreakDays: r.best_streak_days,
    tagline: r.tagline,
  }));
}
