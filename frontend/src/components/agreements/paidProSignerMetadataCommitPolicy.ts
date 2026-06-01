/**
 * Paid Pro signer metadata is staged in React state while typing; consumed authority and
 * corpus hydration run only after explicit finalize (signing snapshot / pin).
 */

import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

export function shouldStagePaidProSignerMetadataLocally(args: {
  signerMetadataSessionActive: boolean;
}): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  return args.signerMetadataSessionActive;
}

/** Skip paid Pro review render repair/hydration while signer metadata is staged in local UI only. */
export function shouldDeferPaidProReviewRenderSignerRepair(args: {
  signerMetadataSessionActive: boolean;
}): boolean {
  return shouldStagePaidProSignerMetadataLocally(args);
}

/**
 * Optional party addresses are not committed to authority/repair until finalize.
 * Restore from a finalized snapshot when re-editing after finalize.
 */
export function partyAddressForSignerMetadataStaging(args: {
  stagedAddress: string;
  hasFinalizedSigningSnapshot: boolean;
  snapshotAddress?: string;
}): string {
  if (args.hasFinalizedSigningSnapshot) {
    return (args.snapshotAddress ?? args.stagedAddress).trim();
  }
  return "";
}
