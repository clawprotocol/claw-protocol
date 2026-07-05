/**
 * Paid Pro SoT session state — leaf module for render/parity hot paths (no render corpus imports).
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

export type PaidProSourceOfTruth = {
  text: string;
  hash: string;
  accepted_at: number;
  source: "server_full_draft";
  reviewSessionId?: string;
  signerManifestHash?: string;
};

export type PaidProDocumentSurface =
  | "display"
  | "copy"
  | "review"
  | "finalized"
  | "signer_setup"
  | "vs01";

let paidProSourceOfTruth: PaidProSourceOfTruth | null = null;

export function hashPaidProCorpus(text: string): string {
  return fingerprintAgreementBody(text || "");
}

export function getPaidProSourceOfTruth(): PaidProSourceOfTruth | null {
  return paidProSourceOfTruth;
}

export function getPaidProSourceOfTruthText(): string {
  return paidProSourceOfTruth?.text ?? "";
}

export function hasPaidProSourceOfTruth(): boolean {
  return Boolean(paidProSourceOfTruth?.text && paidProSourceOfTruth.text.length >= 500);
}

export function replacePaidProSourceOfTruth(next: PaidProSourceOfTruth | null): void {
  paidProSourceOfTruth = next;
}

export function clearPaidProSourceOfTruthState(): PaidProSourceOfTruth | null {
  const prev = paidProSourceOfTruth;
  paidProSourceOfTruth = null;
  return prev;
}
