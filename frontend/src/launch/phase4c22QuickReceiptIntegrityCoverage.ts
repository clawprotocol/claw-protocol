/**
 * Phase 4C.2.2 contracts — receipt issued at completion, never during GET.
 */
import { assertPhase4c21QuickIntegrityContracts } from "./phase4c21QuickIntegrityCoverage";
import { sanitizedEnvelopeMessage } from "./simpleProduct/quickPdfEnvelope";

export function assertPhase4c22QuickReceiptIntegrityContracts(): void {
  assertPhase4c21QuickIntegrityContracts();
  if (!/persisted receipt is not available yet/i.test(sanitizedEnvelopeMessage("receipt_pending"))) {
    throw new Error("4C.2.2 lost the retryable receipt_pending copy");
  }
  if (!/missing or no longer matches/i.test(sanitizedEnvelopeMessage("receipt_unavailable"))) {
    throw new Error("4C.2.2 lost the fail-closed receipt_unavailable copy");
  }
}
