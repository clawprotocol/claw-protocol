/**
 * Post-finalize clause edit save — re-hydrate signer metadata without SoT/canonical refreeze.
 */

import {
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
} from "./authoritativeSigningSnapshot";
import { applyCanonicalPartyLegalNamesToSigningCorpus } from "./canonicalPartyLegalNameSanitizer";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { finalizePaidProPostFinalizeClauseEditCorpus } from "./paidProSignerSigningCorpusHygiene";
import { stripDuplicateConsecutiveExecutionEntityLines } from "./paidProExecutionBlockEntityHeading";
import {
  readConsumedPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
  type PaidProPartyRoleContext,
} from "./paidProSignerMetadataAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProPostFinalizeClauseEditSaveResult =
  | {
      ok: true;
      corpus: string;
      corpusHash: string;
      priorHash: string;
      blankSignerLinesRemaining: number;
      executionBlockCount: number;
    }
  | {
      ok: false;
      reason: string;
      corpusHash: string;
      blankSignerLinesRemaining: number;
    };

let lastEditSavedLog = "";
let lastEditSaveBlockedLog = "";

export function logPaidProPostFinalizeEditSaved(payload: {
  corpusHash: string;
  priorHash: string;
  hydrated: boolean;
  blankSignerLinesRemaining: number;
  bodyLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.priorHash}:${payload.corpusHash}`;
  if (key === lastEditSavedLog) return;
  lastEditSavedLog = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-post-finalize-edit-saved]", payload);
}

export function logPaidProPostFinalizeEditSaveBlocked(payload: {
  reason: string;
  corpusHash: string;
  hydrated: boolean;
  blankSignerLinesRemaining: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.reason}:${payload.corpusHash}`;
  if (key === lastEditSaveBlockedLog) return;
  lastEditSaveBlockedLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-finalize-edit-save-blocked]", payload);
}

export function commitPaidProPostFinalizeClauseEditRevision(args: {
  editedPlain: string;
  roleContext?: PaidProPartyRoleContext | null;
}): PaidProPostFinalizeClauseEditSaveResult {
  const editedPlain = (args.editedPlain || "").trim();
  const priorHash = getAuthoritativeSigningSnapshot()?.hash ?? "";
  const fail = (reason: string, blankSignerLinesRemaining = 0): PaidProPostFinalizeClauseEditSaveResult => ({
    ok: false,
    reason,
    corpusHash: editedPlain.length >= 80 ? hashPaidProCorpus(editedPlain) : priorHash,
    blankSignerLinesRemaining,
  });

  if (!isPaidProPostFinalizeHydratedCorpusLocked() || !hasAuthoritativeSigningSnapshot()) {
    return fail("post_finalize_lock_inactive");
  }
  if (editedPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return fail("edited_plain_too_short");
  }

  const snapshot = getAuthoritativeSigningSnapshot();
  const signerMetadata = snapshot?.signerMetadata;
  if (!signerMetadata) return fail("missing_signer_metadata");

  const parties =
    readConsumedPaidProSignerMetadataAuthority()?.parties ??
    recipientMetadataToAuthorityParties({
      ...signerMetadata,
      partyAddresses: signerMetadata.partyAddresses ?? [],
    });
  if (parties.length < 2) return fail("insufficient_signer_parties");

  const roleContext: PaidProPartyRoleContext = {
    ...args.roleContext,
    acceptedCorpus: args.roleContext?.acceptedCorpus ?? editedPlain,
  };

  let corpus = applyCanonicalPartyLegalNamesToSigningCorpus(editedPlain, parties, roleContext).text.trim();
  corpus = enforcePaidProSingleExecutionBlock(corpus).text.trim();
  corpus = finalizePaidProPostFinalizeClauseEditCorpus(corpus, parties, {
    acceptedCorpus: editedPlain,
    ...roleContext,
  }).text.trim();

  const hydration = hydratePaidProExecutionBlockWithSignerMetadata(corpus, signerMetadata, roleContext);
  if (hydration.applied) {
    corpus = hydration.corpus.trim();
  } else if (countBlankSignerMetadataLinesInExecutionBlock(corpus) > 0) {
    const retry = hydratePaidProExecutionBlockWithSignerMetadata(editedPlain, signerMetadata, {
      ...roleContext,
      acceptedCorpus: editedPlain,
    });
    if (retry.applied) corpus = retry.corpus.trim();
  }

  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(corpus);
  const invariant = analyzePaidProExecutionBlockInvariant(corpus, { expectedParties: parties.length });
  if (!invariant.ok || invariant.executionBlockCount !== 1) {
    return fail("execution_block_invariant_failed", blankSignerLinesRemaining);
  }
  if (blankSignerLinesRemaining > 0) {
    return fail("blank_signer_lines_remaining", blankSignerLinesRemaining);
  }

  const dedupe = stripDuplicateConsecutiveExecutionEntityLines(corpus);
  if (dedupe.repairs.length > 0) {
    corpus = dedupe.text.trim();
  }

  const replaced = replaceAuthoritativeSigningSnapshotCorpus({
    corpus,
    surface: "paid_pro_post_finalize_clause_edit",
  });
  if (!replaced) return fail("snapshot_replace_failed", blankSignerLinesRemaining);

  clearPaidProVisibleRenderMemo();
  auditPaidProReviewRenderSotParity({
    reviewPlain: corpus,
    surface: "paid_pro_post_finalize_clause_edit_save",
  });

  const corpusHash = replaced.hash;
  logPaidProPostFinalizeEditSaved({
    corpusHash,
    priorHash,
    hydrated: true,
    blankSignerLinesRemaining: 0,
    bodyLen: corpus.length,
  });

  return {
    ok: true,
    corpus,
    corpusHash,
    priorHash,
    blankSignerLinesRemaining: 0,
    executionBlockCount: invariant.executionBlockCount,
  };
}
