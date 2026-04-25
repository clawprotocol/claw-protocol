import { apiUrl, errorMessageFromResponse, logClawClientWarning, readJson } from "../lib/clawApi";

export type UsageReceiptPayload = {
  usage_event_id?: string;
  receipt_hash_sha256?: string;
  usage_receipt?: Record<string, unknown>;
};

export type UsageBundlePayload = Record<string, unknown>;

export type UsageReceiptFetch = { data: UsageReceiptPayload | null; error: string | null };

export async function fetchUsageReceipt(usageId: string): Promise<UsageReceiptFetch> {
  const id = (usageId || "").trim();
  if (!id) return { data: null, error: "Missing usage receipt id." };
  try {
    const res = await fetch(apiUrl(`/v1/usage/${encodeURIComponent(id)}/receipt`), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `Could not load receipt (HTTP ${res.status}).`);
      logClawClientWarning("usage.receipt", { status: res.status, usageId: id });
      return { data: null, error: msg };
    }
    const data = await readJson<UsageReceiptPayload>(res);
    return { data, error: null };
  } catch (e) {
    logClawClientWarning("usage.receipt", { error: String(e), usageId: id });
    return { data: null, error: "Could not reach the server." };
  }
}

export type UsageBundleFetch = { data: UsageBundlePayload | null; error: string | null };

export async function fetchUsageBundle(usageId: string): Promise<UsageBundleFetch> {
  const id = (usageId || "").trim();
  if (!id) return { data: null, error: "Missing usage id." };
  try {
    const res = await fetch(apiUrl(`/v1/usage/${encodeURIComponent(id)}/bundle`), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `Could not load bundle (HTTP ${res.status}).`);
      logClawClientWarning("usage.bundle", { status: res.status, usageId: id });
      return { data: null, error: msg };
    }
    const data = await readJson<UsageBundlePayload>(res);
    return { data, error: null };
  } catch (e) {
    logClawClientWarning("usage.bundle", { error: String(e), usageId: id });
    return { data: null, error: "Could not reach the server." };
  }
}

export async function verifyUsageBundle(bundle: UsageBundlePayload): Promise<{
  ok?: boolean;
  errors?: string[];
  checks?: Record<string, unknown>;
}> {
  try {
    const res = await fetch(apiUrl("/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usage_bundle: bundle }),
    });
    return await readJson(res);
  } catch (e) {
    logClawClientWarning("usage.verify", { error: String(e) });
    return { ok: false, errors: ["verify_request_failed"] };
  }
}
