/**
 * Paid Pro SoT session state — leaf module for render/parity hot paths (no render corpus imports).
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

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
  const text = paidProSourceOfTruth?.text?.trim() ?? "";
  if (!text) return false;
  if (text.length >= PAID_PRO_AUTHORITY_MIN_LEN) return true;
  // Freeze-validated short corpora still count as latched SoT once established.
  return text.length >= 40;
}

/** CI-safe live SoT markers on <html> — hashes/lens only, never corpus bytes. */
function publishLivePaidProSoTAuthorityMarkers(next: PaidProSourceOfTruth | null): void {
  if (typeof document === "undefined") return;
  try {
    const root = document.documentElement;
    if (!next?.hash || !next.text || next.text.length < 500) {
      root.removeAttribute("data-claw-live-sot-hash");
      root.removeAttribute("data-claw-live-sot-len");
      return;
    }
    root.setAttribute("data-claw-live-sot-hash", next.hash.trim());
    root.setAttribute("data-claw-live-sot-len", String(next.text.trim().length));
  } catch {
    /* ignore */
  }
}

export function replacePaidProSourceOfTruth(next: PaidProSourceOfTruth | null): void {
  paidProSourceOfTruth = next;
  publishLivePaidProSoTAuthorityMarkers(next);
}

export function clearPaidProSourceOfTruthState(): PaidProSourceOfTruth | null {
  const prev = paidProSourceOfTruth;
  paidProSourceOfTruth = null;
  publishLivePaidProSoTAuthorityMarkers(null);
  return prev;
}
