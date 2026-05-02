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

/**
 * User chose “Send with LawDog Pro” from starter draft → checkout. After Pro completes, bias create-flow
 * send toward signature + sender-first VS01 (not review-link / `/app/send` review shell).
 */
const PAID_PRO_STARTER_SIGNATURE_SEND_SS_KEY = "claw_paid_pro_starter_signature_send_v1";

export function armPaidProStarterSignatureSendFromCreateFlow(): void {
  try {
    sessionStorage.setItem(PAID_PRO_STARTER_SIGNATURE_SEND_SS_KEY, "1");
  } catch {
    /* ignore */
  }
  writePremiumSendIntent("signature");
  writePremiumSenderSignFirst(true);
}

export function peekPaidProStarterSignatureSendFromCreateFlow(): boolean {
  try {
    return sessionStorage.getItem(PAID_PRO_STARTER_SIGNATURE_SEND_SS_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPaidProStarterSignatureSendFromCreateFlow(): void {
  try {
    sessionStorage.removeItem(PAID_PRO_STARTER_SIGNATURE_SEND_SS_KEY);
  } catch {
    /* ignore */
  }
}
