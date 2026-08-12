/**
 * Authoritative signer hydration for paid Pro review and signing surfaces.
 * Review and VS01 must share the same signer-applied corpus from the signing snapshot.
 */

import { manifestToCanonicalPartyIdentities } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  consumeAuthoritativeSignerCount,
  resolveSignerCountFromIdentities,
} from "./signerCountAuthority";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { corpusSignatureBlocksHaveRequiredByLines } from "./guidedDealCompletion/signatureRegion";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
  rebuildSignatureBlocksWithPartyIdentities,
} from "./guidedDealCompletion/signerPartyIdentity";
import type { PaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  authorityPartiesToCanonicalPartyIdentities,
  paidProSignerMetadataForensicLineageEnabled,
} from "./paidProSignerMetadataAuthority";
import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import { applyCanonicalPartyLegalNamesToSigningCorpus } from "./canonicalPartyLegalNameSanitizer";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { stripPremiumIntelligenceCalloutsFromCorpus } from "./premiumDocumentIntelligenceStrip";
import { repairSignatureNameLinesUsingLegalEntity } from "./paidProSignatureNameLineRepair";
import {
  forbidPaidProExecutionBlockSynthesis,
  logPaidProExecutionBlockSynthesisBlocked,
} from "./paidProExecutionBlockAuthority";
import { applyPaidProSignerMetadataMergeGate } from "./paidProSignerMetadataMergeGate";
import {
  authorityPartiesToRecipientMetadata,
  buildLivePaidProSignerMetadataAuthority,
  hashPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
  type LiveSignerMetadataUiState,
} from "./paidProSignerMetadataAuthority";
import { classifyPaidProCorpusLifecycleDiff } from "./paidProCorpusLifecycleDiff";
import {
  buildFrozenServerFullSignerMetadataHydration,
  shouldPreserveFrozenCanonicalCorpusOnSignerFinalize,
  shouldUseFrozenServerFullSourceOfTruthMinimalHydration,
} from "./paidProFrozenServerFullSignerHydration";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
  logPaidProSignerFinalizeParity,
  logPaidProSignerMetadataHydrationApplied,
  logPaidProSignerMetadataHydrationMissing,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { repairExecutionBlockEntityHeadingLines } from "./paidProExecutionBlockEntityHeading";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { resolvePaidProFrozenAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";
import {
  ensureOperativeIfToNoticeDelivery,
  findNoticesSectionStart,
} from "./paidProPartyNoticeDetails";

export type HydratedAuthoritativeSigningCorpusResult = {
  corpus: string;
  identities: CanonicalPartyIdentity[];
  signaturePolishCount: number;
  partyNoticeApplied: boolean;
  rejected: boolean;
  rejectReason?: "corpus_shrink";
};

function resolveHydrationAuthoritativeSignerCount(
  identities: readonly CanonicalPartyIdentity[],
  intakeRaw: string,
  surface: string,
  authorityPartyCount: number,
): number {
  const frozenCount = readFrozenCanonicalManifestPartyCount();
  if (frozenCount >= 2) {
    return consumeAuthoritativeSignerCount(
      `${surface}:frozen_manifest`,
      { intakeText: intakeRaw, manifestPartyCount: frozenCount },
      frozenCount,
    );
  }
  const fromIdentities = resolveSignerCountFromIdentities(
    identities,
    { intakeText: intakeRaw },
    surface,
  );
  if (fromIdentities >= 2) return fromIdentities;
  return Math.max(authorityPartyCount, 2);
}

export function resolveAuthoritativeSignerIdentitiesFromSnapshot(
  snapshot: AuthoritativeSigningSnapshot,
): CanonicalPartyIdentity[] {
  return manifestToCanonicalPartyIdentities(snapshot.partyManifest);
}

export function buildHydratedAuthoritativeSigningCorpus(args: {
  rawCorpus: string;
  identities: readonly CanonicalPartyIdentity[];
  intakeRaw: string;
  surface: string;
  signatureRegionOnly?: boolean;
}): HydratedAuthoritativeSigningCorpusResult {
  const raw = (args.rawCorpus || "").trim();
  const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
    raw,
    args.identities,
    args.intakeRaw,
    { signatureRegionOnly: args.signatureRegionOnly !== false },
  );
  const corpus = identityApply.rejected ? raw : identityApply.text;
  const signerCount = resolveHydrationAuthoritativeSignerCount(
    args.identities,
    args.intakeRaw,
    args.surface,
    args.identities.length,
  );
  const hasFilledBlocks = corpusSignatureBlocksHaveRequiredByLines(corpus, Math.max(2, signerCount));
  logAuthoritativeSignerHydration({
    surface: args.surface,
    rawLen: raw.length,
    hydratedLen: corpus.length,
    signaturePolishCount: identityApply.signaturePolishCount,
    signerCount,
    hasFilledBlocks,
    rejected: Boolean(identityApply.rejected),
    rejectReason: identityApply.rejectReason ?? null,
  });
  logSignatureBlockSource({
    surface: args.surface,
    source: identityApply.rejected ? "raw_corpus_reject" : "signer_identity_apply",
    hasFilledBlocks,
    signerCount,
  });
  if (identityApply.rejected) {
    logSignerHydrationMismatch({
      surface: args.surface,
      reason: "corpus_shrink_rejected",
      rawLen: raw.length,
      afterLen: corpus.length,
    });
  }
  const result = {
    corpus,
    identities: [...args.identities],
    signaturePolishCount: identityApply.signaturePolishCount,
    partyNoticeApplied: false,
    rejected: Boolean(identityApply.rejected),
    rejectReason: identityApply.rejectReason,
  };
  return result;
}

/**
 * Hydrate signing corpus from consumed signer metadata authority and repair missing execution blocks.
 */
export function buildHydratedAuthoritativeSigningCorpusFromAuthority(args: {
  rawCorpus: string;
  authority: PaidProSignerMetadataAuthority;
  intakeRaw: string;
  surface: string;
  /** When true (default), only signature/notice tail is hydrated — opening recitals are preserved. */
  signatureRegionOnly?: boolean;
  /** When true, run recital repair before hydration (finalize only — never during signer typing). */
  repairRecital?: boolean;
}): HydratedAuthoritativeSigningCorpusResult {
  let rawCorpus = (args.rawCorpus || "").trim();
  const rawCorpusLenBeforeHydration = rawCorpus.length;
  const isFinalizeSurface = args.surface === "finalize_paid_pro_signer_metadata";

  // Frozen SoT finalize: apply signer-metadata-only hydration (notices + execution Name/Title/Email)
  // so the authoritative signing snapshot is signing-ready — never store pre-signer placeholders.
  if (
    shouldUseFrozenServerFullSourceOfTruthMinimalHydration(rawCorpus) ||
    (isFinalizeSurface && shouldPreserveFrozenCanonicalCorpusOnSignerFinalize(rawCorpus))
  ) {
    return buildFrozenServerFullSignerMetadataHydration({
      rawCorpus,
      authority: args.authority,
      intakeRaw: args.intakeRaw,
      surface: args.surface,
      signatureRegionOnly: args.signatureRegionOnly !== false && !isFinalizeSurface,
    });
  }

  if (args.repairRecital) {
    rawCorpus = repairMalformedPaidProAgreementRecital(rawCorpus, args.authority.parties).text;
  }
  const roleContext = {
    intakeText: args.intakeRaw,
    acceptedCorpus: rawCorpus,
  };
  const recipientMeta = authorityPartiesToRecipientMetadata(args.authority.parties);
  const executionHydration = hydratePaidProExecutionBlockWithSignerMetadata(
    rawCorpus,
    recipientMeta,
    roleContext,
    { overwriteExistingMetadata: isFinalizeSurface },
  );
  if (executionHydration.applied) {
    rawCorpus = executionHydration.corpus;
    logPaidProSignerMetadataHydrationApplied({
      surface: args.surface,
      fieldsHydrated: executionHydration.fieldsHydrated,
      rawLen: rawCorpusLenBeforeHydration,
      hydratedLen: rawCorpus.length,
    });
  } else if (executionHydration.missingFields.length) {
    logPaidProSignerMetadataHydrationMissing({
      surface: args.surface,
      missingFields: executionHydration.missingFields,
      rawLen: rawCorpusLenBeforeHydration,
    });
  }
  // Fill existing operative If-to notice placeholders from authority contact fields.
  // Signature-region mode must not invent a Notices section, but must resolve known emails/addresses
  // when the corpus already has an If-to notices region with "provided during signer setup".
  let partyNoticeApplied = false;
  const signatureRegionOnly = args.signatureRegionOnly !== false;
  const authorityHasContact = args.authority.parties.some(
    (p) => p.signerEmail.trim() || p.partyAddress.trim() || p.signerName.trim(),
  );
  const noticesIdx = findNoticesSectionStart(rawCorpus);
  if (
    authorityHasContact &&
    noticesIdx >= 0 &&
    (!signatureRegionOnly || /provided during signer setup/i.test(rawCorpus.slice(noticesIdx)))
  ) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(
      rawCorpus,
      args.authority.parties,
      roleContext,
    );
    if (noticeDelivery.repairs.length > 0 || noticeDelivery.text !== rawCorpus) {
      rawCorpus = noticeDelivery.text;
      partyNoticeApplied = noticeDelivery.repairs.length > 0;
    }
  }
  const identities = authorityPartiesToCanonicalPartyIdentities(args.authority.parties, roleContext);
  let result = buildHydratedAuthoritativeSigningCorpus({
    rawCorpus,
    identities,
    intakeRaw: args.intakeRaw,
    surface: args.surface,
    signatureRegionOnly,
  });
  if (partyNoticeApplied) {
    result = { ...result, partyNoticeApplied: true };
  }
  const signerCount = resolveHydrationAuthoritativeSignerCount(
    identities,
    args.intakeRaw,
    args.surface,
    args.authority.parties.length,
  );
  const hasBlocks = corpusSignatureBlocksHaveRequiredByLines(result.corpus, signerCount);
  const hasPopulatedNames = (() => {
    const tail = result.corpus.slice(Math.floor(result.corpus.length * 0.72));
    return (tail.match(/^name\s*:\s*(?!_{4,})(?!\s*$).+/gim) || []).length >= signerCount;
  })();
  const synthesisForbidden = forbidPaidProExecutionBlockSynthesis(result.corpus, signerCount);
  if (!result.rejected && (!hasBlocks || !hasPopulatedNames) && !synthesisForbidden) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(result.corpus, identities);
    if (rebuilt.count > 0) {
      result = {
        ...result,
        corpus: rebuilt.text,
        signaturePolishCount: result.signaturePolishCount + rebuilt.count,
      };
      logSignatureBlockSource({
        surface: args.surface,
        source: "authority_signature_block_rebuild",
        hasFilledBlocks: corpusSignatureBlocksHaveRequiredByLines(rebuilt.text, signerCount),
        signerCount,
      });
    } else if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      logSignerHydrationMismatch({
        surface: args.surface,
        reason: "post_finalize_missing_signature_block",
        rawLen: result.corpus.length,
        afterLen: rebuilt.text.length,
      });
    }
  } else if (synthesisForbidden && (!hasBlocks || !hasPopulatedNames)) {
    logPaidProExecutionBlockSynthesisBlocked({
      surface: args.surface,
      reason: "hydration_signature_block_rebuild_skipped",
    });
    const retryHydration = hydratePaidProExecutionBlockWithSignerMetadata(
      result.corpus,
      recipientMeta,
      roleContext,
      { overwriteExistingMetadata: isFinalizeSurface },
    );
    if (retryHydration.applied && retryHydration.corpus !== result.corpus) {
      result = {
        ...result,
        corpus: retryHydration.corpus,
        signaturePolishCount: result.signaturePolishCount + retryHydration.fieldsHydrated,
      };
      logPaidProSignerMetadataHydrationApplied({
        surface: `${args.surface}:synthesis_forbidden_retry`,
        fieldsHydrated: retryHydration.fieldsHydrated,
        rawLen: result.corpus.length,
        hydratedLen: retryHydration.corpus.length,
      });
    }
  }

  if (!result.rejected && signerCount >= 2) {
    const canonicalParties = applyCanonicalPartyLegalNamesToSigningCorpus(
      result.corpus,
      args.authority.parties,
      roleContext,
    );
    result = {
      ...result,
      corpus: canonicalParties.text,
      signaturePolishCount: result.signaturePolishCount + (canonicalParties.repaired ? 1 : 0),
      partyNoticeApplied: result.partyNoticeApplied,
    };
    if (canonicalParties.repaired) {
      logSignatureBlockSource({
        surface: args.surface,
        source: "canonical_party_legal_name_repair",
        hasFilledBlocks: corpusSignatureBlocksHaveRequiredByLines(canonicalParties.text, signerCount),
        signerCount,
      });
    }
  }

  if (!result.rejected && result.corpus && !isFinalizeSurface) {
    result = {
      ...result,
      corpus: stripPremiumIntelligenceCalloutsFromCorpus(result.corpus),
    };
  }

  if (!result.rejected && signerCount >= 2) {
    const nameRepair = repairSignatureNameLinesUsingLegalEntity(result.corpus, identities);
    if (nameRepair.repairs > 0) {
      result = {
        ...result,
        corpus: nameRepair.text,
        signaturePolishCount: result.signaturePolishCount + nameRepair.repairs,
      };
    }
  }

  if (!result.rejected && signerCount >= 2) {
    const gated = applyPaidProSignerMetadataMergeGate({
      corpus: result.corpus,
      parties: args.authority.parties,
      canonicalPartyCount: args.authority.parties.length,
      roleContext,
    });
    if (gated.repairs.length > 0) {
      result = {
        ...result,
        corpus: gated.text,
        signaturePolishCount: result.signaturePolishCount + gated.repairs.length,
      };
    }
  }

  if (!result.rejected && result.corpus) {
    const finalized = finalizePaidProSigningCorpusText(
      result.corpus,
      args.authority.parties,
      roleContext,
      { signatureRegionOnly },
    );
    if (finalized.text !== result.corpus) {
      result = {
        ...result,
        corpus: finalized.text,
        signaturePolishCount: result.signaturePolishCount + finalized.repairs.length,
        partyNoticeApplied: result.partyNoticeApplied,
      };
    }
  }

  // Re-apply notice contact hydration after finalize hygiene — some repair steps restore
  // "provided during signer setup" placeholders in an existing If-to notices region.
  if (!result.rejected && result.corpus && authorityHasContact) {
    const noticesAfter = findNoticesSectionStart(result.corpus);
    if (
      noticesAfter >= 0 &&
      (!signatureRegionOnly || /provided during signer setup/i.test(result.corpus.slice(noticesAfter)))
    ) {
      const noticeAgain = ensureOperativeIfToNoticeDelivery(
        result.corpus,
        args.authority.parties,
        roleContext,
      );
      if (noticeAgain.text !== result.corpus) {
        result = {
          ...result,
          corpus: noticeAgain.text,
          signaturePolishCount: result.signaturePolishCount + Math.max(1, noticeAgain.repairs.length),
          partyNoticeApplied: true,
        };
      }
    }
  }

  if (!result.rejected && result.corpus && args.authority.parties.length >= 2) {
    const headingRepair = repairExecutionBlockEntityHeadingLines(
      result.corpus,
      args.authority.parties,
    );
    if (headingRepair.repairs.length > 0) {
      result = {
        ...result,
        corpus: headingRepair.text,
        signaturePolishCount: result.signaturePolishCount + headingRepair.repairs.length,
      };
    }
  }

  if (isFinalizeSurface && !result.rejected && result.corpus) {
    const invariant = analyzePaidProExecutionBlockInvariant(result.corpus, {
      expectedParties: signerCount,
    });
    const canonicalHash = resolvePaidProFrozenAuthoritativeHash();
    const finalizedHash = hashPaidProCorpus(result.corpus);
    const classification = classifyPaidProCorpusLifecycleDiff(rawCorpus, result.corpus);
    const signerFieldOnlyDelta =
      classification === "signer_metadata_only" ||
      classification === "execution_block_hydration_only" ||
      classification === "whitespace_or_line_width_only";
    const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(result.corpus);
    logPaidProSignerFinalizeParity({
      surface: args.surface,
      rawLen: rawCorpusLenBeforeHydration,
      hydratedLen: result.corpus.length,
      lenDelta: result.corpus.length - rawCorpusLenBeforeHydration,
      invariantOk:
        invariant.ok &&
        blankSignerLinesRemaining === 0 &&
        (canonicalHash === finalizedHash || signerFieldOnlyDelta),
      executionBlockCount: invariant.executionBlockCount,
      witnessCount: invariant.witnessClauseCount,
      canonicalHash,
      finalizedHash,
      signerFieldOnlyDelta,
      signerHydrationApplied: executionHydration.applied || result.signaturePolishCount > 0,
      blankSignerLinesRemaining,
    });
  }

  return result;
}

export function fingerprintSignerMetadataState(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): string {
  const parties = recipientMetadataToAuthorityParties(meta);
  const authorityHash = hashPaidProSignerMetadataAuthority(parties);
  const legacyEnvelope = fingerprintAgreementBody(
    JSON.stringify({
      recipient1Name: meta.recipient1Name.trim(),
      recipient2Name: meta.recipient2Name.trim(),
      recipient1Email: meta.recipient1Email.trim(),
      recipient2Email: meta.recipient2Email.trim(),
      partySignerNames: [...meta.partySignerNames],
      partySignerTitles: [...meta.partySignerTitles],
      partyAddresses: [...(meta.partyAddresses ?? [])],
      partyLegalNames: [...(meta.partyLegalNames ?? [])],
      partyIds: [...(meta.partyIds ?? [])],
      extraPartyReviewEmails: [...meta.extraPartyReviewEmails],
    }),
  );
  return `${authorityHash}:${legacyEnvelope}`;
}

/** Drift fingerprint from live UI state (all five signer authority fields). */
export function fingerprintLiveSignerMetadataUi(ui: LiveSignerMetadataUiState): string {
  return buildLivePaidProSignerMetadataAuthority(ui).hash;
}

export function signerMetadataDriftedFromSnapshot(
  snapshot: AuthoritativeSigningSnapshot,
  current: AuthoritativeSigningSnapshotRecipientMetadata,
): boolean {
  return fingerprintSignerMetadataState(snapshot.signerMetadata) !== fingerprintSignerMetadataState(current);
}

export function logSnapshotSignerState(payload: {
  partyCount: number;
  signerNames: readonly string[];
  emails: readonly string[];
  corpusHasFilledSignatureBlocks: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[snapshot-signer-state]", payload);
}

export function logAuthoritativeSignerHydration(payload: {
  surface: string;
  rawLen: number;
  hydratedLen: number;
  signaturePolishCount: number;
  signerCount: number;
  hasFilledBlocks: boolean;
  rejected: boolean;
  rejectReason: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!paidProSignerMetadataForensicLineageEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[authoritative-signer-hydration]", payload);
}

export function logSignatureBlockSource(payload: {
  surface: string;
  source: string;
  hasFilledBlocks: boolean;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[signature-block-source]", payload);
}

export function logSignerHydrationMismatch(payload: {
  surface: string;
  reason: string;
  rawLen: number;
  afterLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[signer-hydration-mismatch]", payload);
}

/** Read identities from snapshot when finalized; otherwise null. */
export function readAuthoritativeSignerIdentitiesForSurfaces(): CanonicalPartyIdentity[] | null {
  const snap = getAuthoritativeSigningSnapshot();
  if (!snap) return null;
  return resolveAuthoritativeSignerIdentitiesFromSnapshot(snap);
}
