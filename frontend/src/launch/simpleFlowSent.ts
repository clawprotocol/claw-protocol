/** Session-only confirmation that the user explicitly completed the simple “Send agreement” step. */

import { logProductEvent } from "../lib/experimentation/productEvents";

export function simpleFlowSentStorageKey(agreementId: string): string {
  return `claw_simple_sent_${encodeURIComponent(agreementId)}`;
}

export function markSimpleFlowSent(agreementId: string): void {
  try {
    sessionStorage.setItem(simpleFlowSentStorageKey(agreementId), "1");
  } catch {
    /* ignore quota / private mode */
  }
  logProductEvent("agreement_sent", { agreementId });
}

export function hasMarkedSimpleFlowSent(agreementId: string): boolean {
  try {
    return sessionStorage.getItem(simpleFlowSentStorageKey(agreementId)) === "1";
  } catch {
    return false;
  }
}
