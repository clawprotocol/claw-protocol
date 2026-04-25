import { errorMessageFromResponse, readJson, resolveApiBase } from "../../lib/clawApi";

const OPS_HEADER = "X-Claw-Affiliate-Ops";

export const AFFILIATE_OPS_SECRET_STORAGE_KEY = "clawAffiliateOpsSecret";

export type PayoutBatchSummary = {
  batch_id: string;
  created_at?: string;
  recipients_count: number;
  total_usd: number;
  total_usdc: string;
  status: string;
  safe_balance_usdc: number | null;
  shortfall_usdc: number | null;
  notes: string | null;
  affiliate_id: string;
  exported_at?: string | null;
  paid_at?: string | null;
  safe_tx_hash?: string | null;
  paid_network?: string | null;
  treasury_stub_active: boolean;
  treasury_balance_is_stub?: boolean;
  treasury_funding_required?: boolean;
  export_stale?: boolean;
};

export type PayoutOpsContext = {
  payout_safe_address: string;
  chain_id: number;
  network: string;
  asset: string;
  usdc_contract: string;
  explorer_tx_url_template: string;
  require_tx_hash_for_mark_paid: boolean;
  treasury_stub_configured: boolean;
};

export type OperatorAlertRow = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  payload: Record<string, unknown>;
  batch_id?: string | null;
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
  status: string;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

function baseUrl(): string {
  return resolveApiBase().replace(/\/$/, "");
}

function opsHeaders(secret: string): HeadersInit {
  return {
    [OPS_HEADER]: secret,
    "Content-Type": "application/json",
  };
}

export async function fetchPayoutOpsContext(secret: string): Promise<PayoutOpsContext> {
  const url = `${baseUrl()}/v1/affiliates/ops/payout-context`;
  const res = await fetch(url, { headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load payout context."));
  return readJson<PayoutOpsContext>(res);
}

export async function fetchPayoutBatchSummaries(
  secret: string,
  limit = 50,
): Promise<PayoutBatchSummary[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl()}/v1/affiliates/ops/payout-batches?${q}`;
  const res = await fetch(url, { headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load batches."));
  const j = await readJson<{ batches: PayoutBatchSummary[] }>(res);
  return j.batches ?? [];
}

export type TrustAffiliatePreviewRow = {
  affiliate_id: string;
  referral_code: string;
  unpaid_total_usd: number;
  eligible_next_payout: boolean;
  rolling_forward_usd: number;
  lifetime_paid_usd: number;
  clicks: number;
  conversions: number;
};

export async function fetchTrustAffiliatePreview(
  secret: string,
  limit = 80,
): Promise<TrustAffiliatePreviewRow[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl()}/v1/affiliates/ops/trust/affiliate-preview?${q}`;
  const res = await fetch(url, { headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load trust preview."));
  const j = await readJson<{ affiliates: TrustAffiliatePreviewRow[] }>(res);
  return j.affiliates ?? [];
}

export async function runTrustFridayRollover(secret: string): Promise<Record<string, unknown>> {
  const url = `${baseUrl()}/v1/affiliates/ops/trust/friday-rollover`;
  const res = await fetch(url, { method: "POST", headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Friday rollover failed."));
  return readJson(res);
}

export async function fetchOperatorAlerts(secret: string, limit = 120): Promise<OperatorAlertRow[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl()}/v1/affiliates/ops/operator-alerts?${q}`;
  const res = await fetch(url, { headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load alerts."));
  const j = await readJson<{ alerts: OperatorAlertRow[] }>(res);
  return j.alerts ?? [];
}

export async function fetchAffiliateAccessRequests(
  secret: string,
  opts?: { status?: string; request_type?: string; limit?: number },
): Promise<AffiliateAccessRequestRow[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.request_type) q.set("request_type", opts.request_type);
  q.set("limit", String(opts?.limit ?? 120));
  const url = `${baseUrl()}/v1/affiliates/ops/access-requests?${q}`;
  const res = await fetch(url, { headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load access requests."));
  const j = await readJson<{ requests: AffiliateAccessRequestRow[] }>(res);
  return j.requests ?? [];
}

export async function reviewAffiliateAccessRequest(
  secret: string,
  requestId: string,
  body: { status: "approved" | "declined" | "duplicate" | "spam"; review_note?: string },
): Promise<Record<string, unknown>> {
  const url = `${baseUrl()}/v1/affiliates/ops/access-requests/${encodeURIComponent(requestId)}/review`;
  const res = await fetch(url, {
    method: "POST",
    headers: opsHeaders(secret),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not review access request."));
  return readJson(res);
}

export async function preparePayoutBatches(secret: string, notes?: string): Promise<Record<string, unknown>> {
  const url = `${baseUrl()}/v1/affiliates/ops/payout-batches/prepare`;
  const res = await fetch(url, {
    method: "POST",
    headers: opsHeaders(secret),
    body: JSON.stringify({ notes: notes?.trim() || null }),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Prepare failed."));
  return readJson(res);
}

export async function markBatchExported(secret: string, batchId: string): Promise<Record<string, unknown>> {
  const url = `${baseUrl()}/v1/affiliates/ops/payout-batches/${encodeURIComponent(batchId)}/exported`;
  const res = await fetch(url, { method: "POST", headers: opsHeaders(secret) });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Mark exported failed."));
  return readJson(res);
}

export async function markBatchPaid(
  secret: string,
  batchId: string,
  body: { tx_hash: string; network: string },
): Promise<Record<string, unknown>> {
  const url = `${baseUrl()}/v1/affiliates/ops/payout-batches/${encodeURIComponent(batchId)}/paid`;
  const res = await fetch(url, {
    method: "POST",
    headers: opsHeaders(secret),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Mark paid failed."));
  return readJson(res);
}

export async function fetchSafeBatchJson(secret: string, batchId: string): Promise<unknown> {
  const url = `${baseUrl()}/v1/affiliates/ops/payout-batches/${encodeURIComponent(batchId)}/safe-json`;
  const res = await fetch(url, { headers: { [OPS_HEADER]: secret } });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Safe JSON export failed."));
  return readJson(res);
}

export function safeAppHomeUrl(safeAddress: string): string {
  const a = (safeAddress || "").trim();
  if (!a.startsWith("0x")) return "";
  return `https://app.safe.global/home?safe=base:${encodeURIComponent(a)}`;
}
