/** Session handoff: create-flow premium send mode → SimpleSend initial phase. */
export const PREMIUM_SEND_INTENT_SESSION_KEY = "claw_premium_send_intent";
/** Create-flow: user opted to self-sign before sharing counterparty signing links (signature path only). */
export const PREMIUM_SEND_SENDER_FIRST_SESSION_KEY = "claw_premium_send_sender_sign_first_v1";

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

export function writePremiumSenderSignFirst(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(PREMIUM_SEND_SENDER_FIRST_SESSION_KEY, "1");
    else sessionStorage.removeItem(PREMIUM_SEND_SENDER_FIRST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function peekPremiumSenderSignFirst(): boolean {
  try {
    return sessionStorage.getItem(PREMIUM_SEND_SENDER_FIRST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPremiumSenderSignFirst(): void {
  try {
    sessionStorage.removeItem(PREMIUM_SEND_SENDER_FIRST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
