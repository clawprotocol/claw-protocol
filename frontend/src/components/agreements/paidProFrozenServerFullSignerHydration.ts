/**
 * Minimal signer-metadata hydration for frozen server_full Source of Truth.
 * Mutates only notice contact fields and execution-block Name/Title/Email/Address —
 * never title, recital, section structure, or operative clauses.
 */

import type { PaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
} from "./paidProSignerMetadataAuthority";
import { applySignatureNoticeContactFieldsToCorpus, ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
  logPaidProSignerFinalizeParity,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { stripDuplicateConsecutiveExecutionEntityLines } from "./paidProExecutionBlockEntityHeading";
import { classifyPaidProCorpusLifecycleDiff } from "./paidProCorpusLifecycleDiff";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import type { HydratedAuthoritativeSigningCorpusResult } from "./authoritativeSignerHydration";
import { resolvePaidProFrozenAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";

const FROZEN_SERVER_FULL_SOT_SOURCES = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_draft_degraded",
]);

export function shouldUseFrozenServerFullSourceOfTruthMinimalHydration(rawCorpus: string): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  const sot = getPaidProSourceOfTruth();
  if (!sot) return false;
  const source = (sot.source ?? "").trim();
  if (!FROZEN_SERVER_FULL_SOT_SOURCES.has(source)) return false;
  if (sot.text.trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const raw = (rawCorpus || "").trim();
  if (raw.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const rawHash = hashPaidProCorpus(raw);
  return rawHash === sot.hash || raw === sot.text.trim();
}

/** Hydrate signer metadata into frozen server_full SoT without regenerating operative text. */
export function buildFrozenServerFullSignerMetadataHydration(args: {
  rawCorpus: string;
  authority: PaidProSignerMetadataAuthority;
  intakeRaw: string;
  surface: string;
}): HydratedAuthoritativeSigningCorpusResult {
  const rawCorpusLenBeforeHydration = (args.rawCorpus || "").trim().length;
  let corpus = (args.rawCorpus || "").trim();
  const roleContext = {
    intakeText: args.intakeRaw,
    acceptedCorpus: corpus,
  };
  const recipientMeta = authorityPartiesToRecipientMetadata(args.authority.parties);
  const identities = authorityPartiesToCanonicalPartyIdentities(args.authority.parties, roleContext);

  const executionHydration = hydratePaidProExecutionBlockWithSignerMetadata(
    corpus,
    recipientMeta,
    roleContext,
    { overwriteExistingMetadata: true, frozenCorpusImmutable: true },
  );
  if (executionHydration.applied) {
    corpus = executionHydration.corpus;
  }

  const noticeDelivery = ensureOperativeIfToNoticeDelivery(corpus, args.authority.parties, roleContext);
  if (noticeDelivery.repairs.length > 0) {
    corpus = noticeDelivery.text.trim();
  }

  const contactStrip = applySignatureNoticeContactFieldsToCorpus(corpus, args.authority.parties, roleContext);
  if (contactStrip.applied) {
    corpus = contactStrip.text.trim();
  }

  const dedupe = stripDuplicateConsecutiveExecutionEntityLines(corpus);
  if (dedupe.repairs.length > 0) {
    corpus = dedupe.text;
  }

  const joined = repairJoinedTopLevelSectionHeadings(corpus);
  if (joined.repairs.length > 0) {
    corpus = joined.text;
  }

  const signerCount = args.authority.parties.length;
  const invariant = analyzePaidProExecutionBlockInvariant(corpus, { expectedParties: signerCount });
  const canonicalHash = resolvePaidProFrozenAuthoritativeHash();
  const finalizedHash = hashPaidProCorpus(corpus);
  const classification = classifyPaidProCorpusLifecycleDiff(args.rawCorpus, corpus);
  const signerFieldOnlyDelta =
    classification === "signer_metadata_only" ||
    classification === "execution_block_hydration_only" ||
    classification === "notice_contact_hydration_only" ||
    classification === "whitespace_or_line_width_only";
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(corpus);

  if (args.surface === "finalize_paid_pro_signer_metadata") {
    logPaidProSignerFinalizeParity({
      surface: args.surface,
      rawLen: rawCorpusLenBeforeHydration,
      hydratedLen: corpus.length,
      lenDelta: corpus.length - rawCorpusLenBeforeHydration,
      invariantOk:
        invariant.ok &&
        blankSignerLinesRemaining === 0 &&
        (canonicalHash === finalizedHash || signerFieldOnlyDelta),
      executionBlockCount: invariant.executionBlockCount,
      witnessCount: invariant.witnessClauseCount,
      canonicalHash,
      finalizedHash,
      signerFieldOnlyDelta,
      signerHydrationApplied: executionHydration.applied || noticeDelivery.repairs.length > 0 || contactStrip.applied,
      blankSignerLinesRemaining,
    });
  }

  return {
    corpus,
    identities: [...identities],
    signaturePolishCount:
      executionHydration.fieldsHydrated +
      noticeDelivery.repairs.length +
      (contactStrip.applied ? 1 : 0) +
      dedupe.repairs.length +
      joined.repairs.length,
    partyNoticeApplied: noticeDelivery.repairs.length > 0 || contactStrip.applied,
    rejected: false,
  };
}
