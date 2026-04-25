import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();
const ADMIN_SECRET_KEY = "claw_admin_console_secret_v1";

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

async function adminFetch(path: string, init?: RequestInit): Promise<unknown> {
  const sec = readAdminConsoleSecret().trim();
  if (!sec) throw new Error("missing_admin_secret");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-claw-admin-secret": sec,
      ...(init?.headers || {}),
    },
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!res.ok) throw new Error((data && (data.detail || data.error)) || `http_${res.status}`);
  return data;
}

export const fetchAdminOverview = () => adminFetch("/v1/admin/overview") as Promise<Record<string, unknown>>;
export const fetchAdminUsers = () => adminFetch("/v1/admin/users?limit=200") as Promise<{ users: unknown[] }>;
export const fetchAdminAgreements = () =>
  adminFetch("/v1/admin/agreements?limit=200") as Promise<{ agreements: unknown[] }>;
export const fetchAdminDeliveries = () =>
  adminFetch("/v1/admin/deliveries?limit=200") as Promise<{ events: unknown[] }>;
export const fetchAdminAffiliates = () =>
  adminFetch("/v1/admin/affiliates?limit=200") as Promise<{ affiliates: unknown[] }>;
export const fetchAdminAffiliatePayoutBatches = () =>
  adminFetch("/v1/admin/affiliate-payout-batches?limit=200") as Promise<{ batches: unknown[] }>;
export const fetchAdminAudit = () => adminFetch("/v1/admin/audit?limit=200") as Promise<{ actions: unknown[] }>;

export const adminRefreshEntitlement = (subjectRef: string, reason: string) =>
  adminFetch(`/v1/admin/users/${encodeURIComponent(subjectRef)}/refresh-entitlement`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const adminSetUserDisabled = (subjectRef: string, disabled: boolean, reason: string) =>
  adminFetch(`/v1/admin/users/${encodeURIComponent(subjectRef)}/status`, {
    method: "POST",
    body: JSON.stringify({ disabled, reason }),
  });
export const adminFlagAgreement = (agreementId: string, flagged: boolean, reason: string) =>
  adminFetch(`/v1/admin/agreements/${encodeURIComponent(agreementId)}/flag`, {
    method: "POST",
    body: JSON.stringify({ flagged, reason }),
  });
export const adminResendDelivery = (orgId: string, deliveryId: string, reason: string) =>
  adminFetch(`/v1/admin/deliveries/${encodeURIComponent(orgId)}/${encodeURIComponent(deliveryId)}/resend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const adminSetAffiliateStatus = (affiliateId: string, status: "active" | "disabled" | "hold", reason: string) =>
  adminFetch(`/v1/admin/affiliates/${encodeURIComponent(affiliateId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  });
export const adminPayoutBatchAction = (
  batchId: string,
  action: "approve" | "hold" | "mark_paid",
  reason: string,
) =>
  adminFetch(`/v1/admin/affiliates/payout-batches/${encodeURIComponent(batchId)}/action?action=${encodeURIComponent(action)}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
