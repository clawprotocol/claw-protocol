import { featureFlags } from "../config/featureFlags";
import { isLocalhostDevMonetizationRelax } from "../monetization/lawDogMonetization";

export function simpleFlowSendUnlockStorageKey(agreementId: string): string {
  return `claw_simple_send_unlocked_${encodeURIComponent(agreementId)}`;
}

/** Session unlock after “upgrade” / checkout stub — allows Send step actions for this agreement. */
export function markSimpleFlowSendUnlocked(agreementId: string): void {
  try {
    sessionStorage.setItem(simpleFlowSendUnlockStorageKey(agreementId), "1");
  } catch {
    /* ignore */
  }
}

export function hasSimpleFlowSendUnlocked(agreementId: string): boolean {
  try {
    return sessionStorage.getItem(simpleFlowSendUnlockStorageKey(agreementId)) === "1";
  } catch {
    return false;
  }
}

export function simpleFlowOneTimeUnlockStorageKey(agreementId: string): string {
  return `claw_simple_agreement_onetime_${encodeURIComponent(agreementId)}`;
}

/** One-time paid unlock for this agreement only (session-scoped). */
export function markOneTimeAgreementUnlock(agreementId: string): void {
  try {
    sessionStorage.setItem(simpleFlowOneTimeUnlockStorageKey(agreementId), "1");
  } catch {
    /* ignore */
  }
}

export function hasOneTimeAgreementUnlock(agreementId: string): boolean {
  try {
    return sessionStorage.getItem(simpleFlowOneTimeUnlockStorageKey(agreementId)) === "1";
  } catch {
    return false;
  }
}

export function isSimpleSendPaywallActive(): boolean {
  if (isLocalhostDevMonetizationRelax()) return false;
  if (featureFlags.simpleFlowPaywallBypass) return false;
  return featureFlags.simpleFlowSendPaywall;
}

export function canAccessSimpleSendActions(agreementId: string): boolean {
  if (!isSimpleSendPaywallActive()) return true;
  return hasSimpleFlowSendUnlocked(agreementId) || hasOneTimeAgreementUnlock(agreementId);
}

/**
 * When returning from full billing with `returnTo=/app/send/{id}?phase=send`, restore unlock so Send isn’t a dead end.
 */
export function applySimpleSendUnlockFromReturnPath(returnTo: string): void {
  const path = (returnTo || "").trim().split("?")[0] || "";
  const m = /^\/app\/send\/([^/]+)/.exec(path);
  if (!m) return;
  markSimpleFlowSendUnlocked(decodeURIComponent(m[1]));
}
