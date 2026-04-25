/** Session handoff: create-flow premium send mode → SimpleSend initial phase. */
export const PREMIUM_SEND_INTENT_SESSION_KEY = "claw_premium_send_intent";

export type PremiumSendIntent = "review" | "signature";

export function writePremiumSendIntent(intent: PremiumSendIntent): void {
  try {
    sessionStorage.setItem(PREMIUM_SEND_INTENT_SESSION_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function peekPremiumSendIntent(): PremiumSendIntent | null {
  try {
    const v = sessionStorage.getItem(PREMIUM_SEND_INTENT_SESSION_KEY);
    if (v === "review" || v === "signature") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPremiumSendIntent(): void {
  try {
    sessionStorage.removeItem(PREMIUM_SEND_INTENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
