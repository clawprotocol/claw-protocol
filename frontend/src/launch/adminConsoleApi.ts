import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { refreshCachedAccessToken } from "../auth/authAccessTokenCache";
import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();
/** Shared admin-secret key for Founder HQ and ops routes (sessionStorage only). */
const ADMIN_SECRET_KEY = "claw_admin_console_secret_v1";

/** Fixed read-only audit reason for Admin Console Connect / list loads. */
export const ADMIN_CONSOLE_CONNECT_REASON = "admin_console_connect";

/** Operator-facing copy when Connect has not persisted an admin secret yet. */
export const MISSING_ADMIN_SECRET_MESSAGE =
  "Admin secret missing. Connect from Admin Dashboard first, then reopen Genesis Referral Ops.";

/** Operator-facing copy when backend rejects x-claw-admin-secret. */
export const ADMIN_SECRET_REJECTED_MESSAGE =
  "Admin secret was rejected. Re-enter the correct secret and click Connect.";

export const ADMIN_SIGN_IN_REQUIRED_MESSAGE =
  "Sign in required. Refresh the page or sign in again, then reconnect Admin Dashboard.";

export function readAdminConsoleSecret(): string {
  try {
    return (sessionStorage.getItem(ADMIN_SECRET_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeAdminConsoleSecret(secret: string): void {
  try {
    const s = secret.trim();
    if (!s) sessionStorage.removeItem(ADMIN_SECRET_KEY);
    else sessionStorage.setItem(ADMIN_SECRET_KEY, s);
  } catch {
    /* ignore */
  }
}

/**
 * Clear the in-session admin secret and remove any stale localStorage copy
 * left by older builds that mirrored the key.
 */
export function clearAdminConsoleSecret(): void {
  writeAdminConsoleSecret("");
  try {
    localStorage.removeItem(ADMIN_SECRET_KEY);
  } catch {
    /* ignore */
  }
}

/** Turn FastAPI object/string detail into a readable Error message (not `[object Object]`). */
export function formatAdminApiErrorDetail(detail: unknown, fallbackStatus: number): string {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code.trim() : "";
    const message = typeof o.message === "string" ? o.message.trim() : "";
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
    if (code) return code;
    try {
      return JSON.stringify(detail);
    } catch {
      /* fall through */
    }
  }
  if (detail != null && String(detail).trim() && String(detail) !== "[object Object]") {
    return String(detail);
  }
  return `http_${fallbackStatus}`;
}

export function mapAdminApiHttpError(detail: unknown, status: number): string {
  const formatted = formatAdminApiErrorDetail(detail, status);
  const lower = formatted.toLowerCase();
  if (status === 403) {
    if (
      lower.includes("invalid operator secret") ||
      lower.includes("admin_secret") ||
      lower.includes("\"code\":\"forbidden\"") ||
      lower.startsWith("forbidden")
    ) {
      return ADMIN_SECRET_REJECTED_MESSAGE;
    }
    if (lower.includes("operator_role_required")) {
      return "Your account is not an active operator. Operator role is required for Admin Dashboard.";
    }
  }
  if (status === 401) {
    return ADMIN_SIGN_IN_REQUIRED_MESSAGE;
  }
  return formatted;
}

/**
 * Privileged admin headers: session secret + hydrated Supabase JWT.
 * Always force Authorization — do not depend on org-id prefix or cold in-memory cache.
 */
export async function buildAdminAuthHeaders(
  opts?: { reason?: string; extra?: Record<string, string> },
): Promise<Record<string, string>> {
  const sec = readAdminConsoleSecret().trim();
  if (!sec) throw new Error(MISSING_ADMIN_SECRET_MESSAGE);
  const token = (await refreshCachedAccessToken()).trim();
  if (!token) throw new Error(ADMIN_SIGN_IN_REQUIRED_MESSAGE);
  const reason = (opts?.reason || "").trim() || ADMIN_CONSOLE_CONNECT_REASON;
  const headers = clawAgreementHeaders({
    "Content-Type": "application/json",
    "x-claw-admin-secret": sec,
    "x-claw-admin-reason": reason,
    ...(opts?.extra || {}),
  }) as Record<string, string>;
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function adminFetch(
  path: string,
  init?: RequestInit,
  opts?: { reason?: string },
): Promise<unknown> {
  const headers = await buildAdminAuthHeaders({
    reason: opts?.reason,
    extra: (init?.headers as Record<string, string> | undefined) || undefined,
  });
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const txt = await res.text();
  let data: Record<string, unknown> = {};
  if (txt) {
    try {
      data = JSON.parse(txt) as Record<string, unknown>;
    } catch {
      if (!res.ok) throw new Error(txt.slice(0, 200) || `http_${res.status}`);
      throw new Error("admin_api_invalid_json");
    }
  }
  if (!res.ok) {
    throw new Error(mapAdminApiHttpError(data.detail ?? data.error, res.status));
  }
  return data;
}

export const fetchAdminOverview = () =>
  adminFetch("/v1/admin/overview", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<
    Record<string, unknown>
  >;
export const fetchAdminUsers = () =>
  adminFetch("/v1/admin/users?limit=200", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<{
    users: unknown[];
  }>;
export const fetchAdminAgreements = () =>
  adminFetch("/v1/admin/agreements?limit=200", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<{
    agreements: unknown[];
  }>;
export const fetchAdminDeliveries = () =>
  adminFetch("/v1/admin/deliveries?limit=200", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<{
    events: unknown[];
  }>;
export const fetchAdminAffiliates = () =>
  adminFetch("/v1/admin/affiliates?limit=200", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<{
    affiliates: unknown[];
  }>;
export const fetchAdminAffiliatePayoutBatches = () =>
  adminFetch("/v1/admin/affiliate-payout-batches?limit=200", undefined, {
    reason: ADMIN_CONSOLE_CONNECT_REASON,
  }) as Promise<{ batches: unknown[] }>;
export const fetchAdminAudit = () =>
  adminFetch("/v1/admin/audit?limit=200", undefined, { reason: ADMIN_CONSOLE_CONNECT_REASON }) as Promise<{
    actions: unknown[];
  }>;

export const adminRefreshEntitlement = (subjectRef: string, reason: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(subjectRef)}/refresh-entitlement`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    { reason },
  );

export const adminGrantGenesisEntitlement = (
  userId: string,
  reason: string,
  opts?: { expiresAt?: string | null; allowanceOverride?: number | null },
) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(userId)}/genesis-entitlement/grant`,
    {
      method: "POST",
      body: JSON.stringify({
        reason,
        expires_at: opts?.expiresAt || null,
        allowance_override: opts?.allowanceOverride ?? null,
      }),
    },
    { reason },
  );

export const adminRevokeGenesisEntitlement = (userId: string, reason: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(userId)}/genesis-entitlement/revoke`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    { reason },
  );

export const adminGetGenesisEntitlement = (userId: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(userId)}/genesis-entitlement`,
    undefined,
    { reason: ADMIN_CONSOLE_CONNECT_REASON },
  ) as Promise<Record<string, unknown>>;

/** Reset this user's Genesis Dog monthly agreement meter to 0 (audited). */
export const adminResetGenesisMonthlyUsage = (userId: string, reason: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(userId)}/genesis-usage/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({
        reason,
        mode: "reset_month_to_zero",
        dry_run: false,
      }),
    },
    { reason },
  ) as Promise<Record<string, unknown>>;

export const adminGetGenesisUsage = (userId: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(userId)}/genesis-usage`,
    undefined,
    { reason: ADMIN_CONSOLE_CONNECT_REASON },
  ) as Promise<Record<string, unknown>>;

export const adminMigrateLegacyGenesisAffiliates = (reason: string) =>
  adminFetch(
    `/v1/admin/genesis-entitlement/migrate-legacy-affiliates`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    { reason },
  );
export const adminSetUserDisabled = (subjectRef: string, disabled: boolean, reason: string) =>
  adminFetch(
    `/v1/admin/users/${encodeURIComponent(subjectRef)}/status`,
    {
      method: "POST",
      body: JSON.stringify({ disabled, reason }),
    },
    { reason },
  );
export const adminFlagAgreement = (agreementId: string, flagged: boolean, reason: string) =>
  adminFetch(
    `/v1/admin/agreements/${encodeURIComponent(agreementId)}/flag`,
    {
      method: "POST",
      body: JSON.stringify({ flagged, reason }),
    },
    { reason },
  );
export const adminResendDelivery = (orgId: string, deliveryId: string, reason: string) =>
  adminFetch(
    `/v1/admin/deliveries/${encodeURIComponent(orgId)}/${encodeURIComponent(deliveryId)}/resend`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    { reason },
  );
export const adminSetAffiliateStatus = (
  affiliateId: string,
  status: "active" | "disabled" | "hold",
  reason: string,
) =>
  adminFetch(
    `/v1/admin/affiliates/${encodeURIComponent(affiliateId)}/status`,
    {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    },
    { reason },
  );
export const adminPayoutBatchAction = (
  batchId: string,
  action: "approve" | "hold" | "mark_paid",
  reason: string,
) =>
  adminFetch(
    `/v1/admin/affiliates/payout-batches/${encodeURIComponent(batchId)}/action?action=${encodeURIComponent(action)}`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    { reason },
  );

/** Genesis Referral Access — ops summary row (admin). */
export type GenesisReferralOpsAffiliateRow = {
  id: string;
  user_id: string;
  display_name: string;
  referral_code: string;
  community_slug?: string | null;
  affiliate_status: string;
  payout_rate: number;
  referral_link_path?: string;
  capture_visits?: number;
  converted_referrals: number;
  active_referred_subscriptions?: number;
  commission_pending_usd: number;
  commission_payable_usd: number;
  commission_paid_usd: number;
  commission_void_usd?: number;
  commission_total_usd?: number;
};

export type CreateGenesisReferralAffiliateBody = {
  user_id: string;
  display_name: string;
  referral_code: string;
  community_slug?: string | null;
  affiliate_status: "active" | "paused" | "revoked";
  payout_rate: number;
  reason: string;
};

export type GenesisDogAffiliateCandidate = {
  user_id: string;
  org_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  community_slug?: string | null;
  signup_intent?: string | null;
  affiliate_candidate?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export const fetchGenesisReferralOpsSummary = () =>
  adminFetch("/v1/genesis-referral/ops/summary", undefined, {
    reason: ADMIN_CONSOLE_CONNECT_REASON,
  }) as Promise<{ affiliates?: GenesisReferralOpsAffiliateRow[]; count?: number }>;

export const fetchGenesisDogAffiliateCandidates = () =>
  adminFetch("/v1/genesis-referral/ops/candidates", undefined, {
    reason: ADMIN_CONSOLE_CONNECT_REASON,
  }) as Promise<{ candidates?: GenesisDogAffiliateCandidate[]; count?: number; ok?: boolean }>;

export const adminCreateGenesisReferralAffiliate = (body: CreateGenesisReferralAffiliateBody) =>
  adminFetch(
    "/v1/genesis-referral/ops/affiliates",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { reason: body.reason },
  ) as Promise<{ ok?: boolean; affiliate?: GenesisReferralOpsAffiliateRow }>;

/** Download commissions CSV for manual payout reconciliation. */
export async function downloadGenesisReferralCommissionsCsv(): Promise<void> {
  const headers = await buildAdminAuthHeaders({ reason: "genesis_ops_commissions_export" });
  delete headers["Content-Type"];
  const res = await fetch(`${API_BASE}/v1/genesis-referral/ops/commissions/export.csv`, {
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const txt = await res.text();
    let detail: unknown = txt;
    try {
      detail = JSON.parse(txt)?.detail ?? txt;
    } catch {
      /* keep text */
    }
    throw new Error(mapAdminApiHttpError(detail, res.status));
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "genesis_commissions.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
