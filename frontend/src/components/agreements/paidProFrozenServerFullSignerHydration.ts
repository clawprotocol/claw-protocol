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
import {
  applySignatureNoticeContactFieldsToCorpus,
  ensureOperativeIfToNoticeDelivery,
  findNoticesSectionStart,
  repairCollapsedInlineNoticeStanzas,
} from "./paidProPartyNoticeDetails";
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

export function shouldUseFrozenServerFullSourceOfTruthMinimalHydration(rawCorpus: string): boolean {
  return shouldUseFrozenPaidProSourceOfTruthMinimalHydration(rawCorpus);
}

/** Any established paid Pro SoT with matching raw corpus — metadata-only hydration path. */
export function shouldUseFrozenPaidProSourceOfTruthMinimalHydration(rawCorpus: string): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  const sot = getPaidProSourceOfTruth();
  if (!sot) return false;
  if (sot.text.trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const raw = (rawCorpus || "").trim();
  if (raw.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const rawHash = hashPaidProCorpus(raw);
  return rawHash === sot.hash || raw === sot.text.trim();
}

export function shouldPreserveFrozenCanonicalCorpusOnSignerFinalize(rawCorpus: string): boolean {
  return shouldUseFrozenPaidProSourceOfTruthMinimalHydration(rawCorpus);
}

/** Hydrate signer metadata into frozen server_full SoT without regenerating operative text. */
export function buildFrozenServerFullSignerMetadataHydration(args: {
  rawCorpus: string;
  authority: PaidProSignerMetadataAuthority;
  intakeRaw: string;
  surface: string;
  /** When true, fill execution/notice contacts only — never invent a Notices section. */
  signatureRegionOnly?: boolean;
}): HydratedAuthoritativeSigningCorpusResult {
  const rawCorpusLenBeforeHydration = (args.rawCorpus || "").trim().length;
  let corpus = (args.rawCorpus || "").trim();
  const signatureRegionOnly = args.signatureRegionOnly !== false;
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

  // Never invent a Notices section in signature-region mode. When Notices already exist
  // with "provided during signer setup" placeholders and authority has real contacts,
  // resolve those placeholders (parity with non-frozen finalize hydration).
  let noticeDeliveryRepairs = 0;
  const noticesIdx = findNoticesSectionStart(corpus);
  const authorityHasContact = args.authority.parties.some(
    (p) => p.signerEmail.trim() || p.partyAddress.trim() || p.signerName.trim(),
  );
  if (
    authorityHasContact &&
    noticesIdx >= 0 &&
    (!signatureRegionOnly || /provided during signer setup/i.test(corpus.slice(noticesIdx)))
  ) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(
      corpus,
      args.authority.parties,
      roleContext,
    );
    noticeDeliveryRepairs = noticeDelivery.repairs.length;
    if (noticeDeliveryRepairs > 0 || noticeDelivery.text !== corpus) {
      corpus = noticeDelivery.text.trim();
    }
  }

  // Signature-region-only finalize (TEST307) must hydrate Name/Title in the execution
  // block without writing Email: lines into operative notice stanzas.
  let contactStrip = { applied: false, text: corpus };
  if (!signatureRegionOnly) {
    contactStrip = applySignatureNoticeContactFieldsToCorpus(
      corpus,
      args.authority.parties,
      roleContext,
    );
    if (contactStrip.applied) {
      corpus = contactStrip.text.trim();
    }
  }

  const dedupe = stripDuplicateConsecutiveExecutionEntityLines(corpus);
  if (dedupe.repairs.length > 0) {
    corpus = dedupe.text;
  }

  let joinedRepairs = 0;
  if (!signatureRegionOnly) {
    const joined = repairJoinedTopLevelSectionHeadings(corpus);
    joinedRepairs = joined.repairs.length;
    if (joinedRepairs > 0) {
      corpus = joined.text;
    }

    const collapsedNotices = repairCollapsedInlineNoticeStanzas(corpus);
    if (collapsedNotices.repairs.length > 0) {
      corpus = collapsedNotices.text;
    }
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
      signerHydrationApplied:
        executionHydration.applied || noticeDeliveryRepairs > 0 || contactStrip.applied,
      blankSignerLinesRemaining,
    });
  }

  return {
    corpus,
    identities: [...identities],
    signaturePolishCount:
      executionHydration.fieldsHydrated +
      noticeDeliveryRepairs +
      (contactStrip.applied ? 1 : 0) +
      dedupe.repairs.length +
      joinedRepairs,
    partyNoticeApplied: noticeDeliveryRepairs > 0 || contactStrip.applied,
    rejected: false,
  };
}
