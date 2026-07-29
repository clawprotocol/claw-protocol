import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();
const ADMIN_SECRET_KEY = "claw_admin_console_secret_v1";

/** Fixed read-only audit reason for Admin Console Connect / list loads. */
export const ADMIN_CONSOLE_CONNECT_REASON = "admin_console_connect";

export function readAdminConsoleSecret(): string {
  try {
    return sessionStorage.getItem(ADMIN_SECRET_KEY) || "";
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
    // ignore
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

async function adminFetch(
  path: string,
  init?: RequestInit,
  opts?: { reason?: string },
): Promise<unknown> {
  const sec = readAdminConsoleSecret().trim();
  if (!sec) throw new Error("missing_admin_secret");
  const reason = (opts?.reason || "").trim() || ADMIN_CONSOLE_CONNECT_REASON;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: clawAgreementHeaders({
      "Content-Type": "application/json",
      "x-claw-admin-secret": sec,
      "x-claw-admin-reason": reason,
      ...(init?.headers as Record<string, string> | undefined),
    }),
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
    throw new Error(formatAdminApiErrorDetail(data.detail ?? data.error, res.status));
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
