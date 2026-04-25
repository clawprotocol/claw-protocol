import { apiUrl, errorMessageFromResponse, readJson } from "../../lib/clawApi";

const SESSION_KEY_PREFIX = "claw_trust_click_idem:";

function clickIdempotencyKey(referralCode: string): string {
  const code = referralCode.trim().toLowerCase();
  try {
    const k = `${SESSION_KEY_PREFIX}${code}`;
    const existing = sessionStorage.getItem(k);
    if (existing && existing.length >= 8) return existing;
    const created = `clk_${crypto.randomUUID().replace(/-/g, "")}`;
    sessionStorage.setItem(k, created);
    return created;
  } catch {
    return `clk_${code}_${Date.now()}`;
  }
}

/** Server-backed click attribution (append-only ledger). Best-effort — failures are silent. */
export async function recordAffiliateTrustClick(referralCode: string): Promise<void> {
  const code = referralCode.trim();
  if (code.length < 2) return;
  const idem = clickIdempotencyKey(code);
  try {
    const res = await fetch(apiUrl("/v1/affiliates/trust/record-click"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_code: code, idempotency_key: idem }),
    });
    if (!res.ok) {
      await errorMessageFromResponse(res, "click");
    } else {
      void readJson(res);
    }
  } catch {
    /* non-blocking */
  }
}
