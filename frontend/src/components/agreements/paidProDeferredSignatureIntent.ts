/**
 * Defers starter-flow signature send intent until the user explicitly prepares signatures.
 */

import {
  clearPaidProStarterSignatureSendFromCreateFlow,
  peekPaidProStarterSignatureSendFromCreateFlow,
} from "../../launch/simpleProduct/premiumSendIntent";

let deferredStarterSignatureIntent = false;

/** Capture starter signature intent without arming review UI as signature-first. */
export function capturePaidProDeferredStarterSignatureIntent(): boolean {
  if (!peekPaidProStarterSignatureSendFromCreateFlow()) return false;
  deferredStarterSignatureIntent = true;
  clearPaidProStarterSignatureSendFromCreateFlow();
  return true;
}

export function consumePaidProDeferredStarterSignatureIntent(): boolean {
  if (!deferredStarterSignatureIntent) return false;
  deferredStarterSignatureIntent = false;
  return true;
}

export function peekPaidProDeferredStarterSignatureIntent(): boolean {
  return deferredStarterSignatureIntent;
}

export function resetPaidProDeferredStarterSignatureIntentForTests(): void {
  deferredStarterSignatureIntent = false;
}
