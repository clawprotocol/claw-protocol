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
import {
  labeledPartyIntakeHasHydratableExecutionFields,
  mergeLabeledPartyAuthorityIntoParties,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { isLabeledMultiPartyIntake } from "./labeledPartyBlockParse";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";

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

/**
 * Labeled 3-party intakes may have blank signer names on one slot while email/address are known.
 * Apply execution-block overlay when slot-index authority has any hydratable field.
 */
export function shouldApplyLabeledPartyPartialExecutionHydration(args: {
  parties: readonly PaidProSignerMetadataParty[];
  intakeText?: string | null;
}): boolean {
  const intake = (args.intakeText ?? "").trim();
  if (!intake || !isLabeledMultiPartyIntake(intake, 3)) return false;
  if (!labeledPartyIntakeHasHydratableExecutionFields(intake)) return false;
  const merged = mergeLabeledPartyAuthorityIntoParties(args.parties, intake);
  const expectedCount = isLabeledMultiPartyIntake(intake, 4) ? 4 : 3;
  if (merged.length < expectedCount) return false;
  return merged.every((p) => p.partyLegalName.trim().length >= 2);
}

export function shouldApplyExecutionBlockSignerOverlay(args: {
  parties: readonly PaidProSignerMetadataParty[];
  intakeText?: string | null;
  corpusText?: string | null;
}): boolean {
  if (shouldUsePaidProSourceOfTruthDisplayOnly()) {
    const parties = args.parties ?? [];
    const withLegal = parties.filter((p) => p.partyLegalName.trim().length >= 2);
    if (withLegal.length >= 3 && hasSignerMetadataForExecutionOverlay(parties)) {
      return true;
    }
    return false;
  }
  if (
    args.corpusText?.trim() &&
    executionBlockSignerMetadataAppearsHydrated(args.corpusText, args.parties)
  ) {
    return false;
  }
  if (shouldApplyLabeledPartyPartialExecutionHydration(args)) return true;
  return (
    hasSignerMetadataForExecutionOverlay(args.parties) ||
    shouldHydratePaidProReviewSurfacesFromConsumedAuthority(args.parties)
  );
}

/** Skip re-hydration when execution block already contains signer names from a prior pass. */
export function executionBlockSignerMetadataAppearsHydrated(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0 || parties.length < 2) return false;
  const tail = corpus.slice(witnessIdx);
  const withNames = parties.filter((p) => p.signerName.trim().length >= 2);
  if (withNames.length < 2) return false;
  return withNames.every((p) => {
    const name = p.signerName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^name\\s*:\\s*${name}\\b`, "im").test(tail);
  });
}

/** Review render must apply signer execution overlay (live session or consumed authority). */
export function paidProReviewRenderNeedsSignerExecutionOverlay(args: {
  deferSignerMetadataRepair?: boolean;
  parties: readonly PaidProSignerMetadataParty[];
  intakeText?: string | null;
}): boolean {
  if (args.deferSignerMetadataRepair) return true;
  return shouldApplyExecutionBlockSignerOverlay({
    parties: args.parties,
    intakeText: args.intakeText,
  });
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
