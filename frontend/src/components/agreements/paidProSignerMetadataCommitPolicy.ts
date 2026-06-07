/**
 * Paid Pro signer metadata is staged in React state while typing; consumed authority and
 * corpus hydration run only after explicit finalize (signing snapshot / pin).
 */

import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";

function paidProSignerExecutionCorpusIsFrozenForHydration(): boolean {
  if (hasAuthoritativeSigningSnapshot()) return true;
  return readPaidProPinnedSignerAppliedCorpus().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN;
}

/** Post-finalize signing snapshot is locked — review must not re-sanitize or re-hydrate. */
export function isPaidProPostFinalizeHydratedCorpusLocked(): boolean {
  return paidProSignerExecutionCorpusIsFrozenForHydration();
}

export function consumedAuthoritySignerMetadataComplete(
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  if (parties.length < 2) return false;
  return parties.every((p) => {
    const legal = p.partyLegalName.trim();
    return legal.length >= 2 && p.signerName.trim().length >= 1 && p.signerEmail.trim().length >= 3;
  });
}

/** Human signer name present for render-time execution-block overlay (email not required). */
export function hasSignerMetadataForExecutionOverlay(
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  if (parties.length < 2) return false;
  return parties.every((p) => {
    const legal = p.partyLegalName.trim();
    return legal.length >= 2 && p.signerName.trim().length >= 1;
  });
}

/** Review render must apply signer execution overlay (live session or consumed authority). */
export function paidProReviewRenderNeedsSignerExecutionOverlay(args: {
  deferSignerMetadataRepair?: boolean;
  parties: readonly PaidProSignerMetadataParty[];
}): boolean {
  if (args.deferSignerMetadataRepair) return true;
  return (
    hasSignerMetadataForExecutionOverlay(args.parties) ||
    shouldHydratePaidProReviewSurfacesFromConsumedAuthority(args.parties)
  );
}

/** Hydrate notice/signature metadata on review surfaces (not while live signer session is active). */
export function shouldHydratePaidProReviewSurfacesFromConsumedAuthority(
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  if (paidProSignerExecutionCorpusIsFrozenForHydration()) return false;
  if (!consumedAuthoritySignerMetadataComplete(parties)) return false;
  return !isPaidProReviewSignerMetadataSessionActive();
}

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
