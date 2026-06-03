/**
 * Runtime flag: paid Pro signer-metadata edit session is active (React intake only).
 * While true, review surfaces stay on display-only SoT to avoid post-commit churn.
 */

let signerMetadataSessionActive = false;

export function setPaidProReviewSignerMetadataSessionActive(active: boolean): void {
  signerMetadataSessionActive = active;
}

export function isPaidProReviewSignerMetadataSessionActive(): boolean {
  return signerMetadataSessionActive;
}

export function resetPaidProReviewSignerMetadataSessionActiveForTests(): void {
  signerMetadataSessionActive = false;
}
