/** Stub: wire to billing when free sends are a real entitlement */

const KEY = "claw_free_send_credits_v1";

export function readFreeSendCredits(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = Number(localStorage.getItem(KEY) ?? "0");
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

export function consumeOneFreeSendCredit(): boolean {
  const n = readFreeSendCredits();
  if (n < 1) return false;
  try {
    localStorage.setItem(KEY, String(n - 1));
  } catch {
    return false;
  }
  return true;
}

export function seedFreeSendCreditsForDev(n: number): void {
  try {
    localStorage.setItem(KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}
