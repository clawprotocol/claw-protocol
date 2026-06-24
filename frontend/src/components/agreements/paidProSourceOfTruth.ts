/**
 * Paid Pro source of truth.
 *
 * Once a paid Pro server_full_draft is accepted, this is the only agreement body
 * the frontend may display, copy, finalize, or send to signing unless the user
 * explicitly creates a revision.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { clearAcceptedProCorpusSafeDisplayCacheForTests } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";
import { resetPaidProCorpusLifecycleDiffForTests } from "./paidProCorpusLifecycleDiff";
import { validateProMinimumSubstance } from "./paidProConciseServicesQuality";
import { logPreFreezePlaceholderRejectionDetails } from "./agreementTemplatePlaceholderSafety";
import {
  hasPaidProPipelineSessionAcceptance,
} from "./paidProPostAcceptanceValidatorCache";
import { PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { logFalseProAuthorityBlocked } from "./paidProRuntimeAuthorityEstablishment";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
  hasFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
  type CanonicalAgreementSurface,
} from "./canonicalAgreementSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  buildPaidProNormalizedSurfaceDiffPayload,
  logPaidProNormalizedSurfaceDiff,
} from "./paidProNormalizedSurfaceDiff";
import {
  logCanonicalEstablishReconcile,
  logExecutionBlockCount,
  logExecutionBlockLocation,
  logPostFreezeCorpusDrift,
} from "./paidProExecutionBlockInstrumentation";
import { logPaidProFreezeEstablished } from "./paidProFreezeDiagnostics";
import {
  enforceAuthoritativeProCorpusDisplay,
  logProCorpusSourceMap,
} from "./proCorpusSourcePath";
import {
  authoritativeDocumentForSurface,
  clearAuthoritativeAgreementDocument,
  establishAuthoritativeAgreementDocument,
  hydrateAuthoritativeAgreementDocument,
} from "./authoritativeAgreementDocument";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  resolvePaidProFinalHydratedCorpusForSurface,
  type PaidProFinalHydratedCorpusSource,
} from "./paidProFinalHydratedCorpus";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { paidProSurfaceCorpusMatchesAuthority } from "./paidProAgreementAuthorityChain";
import {
  applyPaidProReviewRenderSanitizer,
  consumedAuthoritySignerMetadataComplete,
  resolvePartiesForReviewRender,
  resolvePaidProReviewRenderPlain,
} from "./paidProReviewRenderCorpus";
import {
  isPaidProUserVisibleDocumentSurface,
  resolvePaidProDisplayPlainForSurface,
  resolvePaidProFrozenUserVisibleReviewDisplayHash,
} from "./paidProDisplayPlainAuthority";
import { paidProSignerExecutionCorpusIsFrozen } from "./paidProFinalHydratedCorpus";
import { logPaidProDriftCorpusCaptureOnce } from "./paidProDriftCorpusCapture";
import { tracePaidProCorpusMutation } from "./paidProMutationTrace";
import {
  hashPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { writePremiumRecipientHandoffLinear } from "./premiumPartyNamesHandoff";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";
import { resolvePaidProFrozenDisplayAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import {
  clearPaidProReviewRenderFusedRepairCache,
} from "./paidProReviewRenderCorpus";
import {
  clearPaidProSignerStagingDisplayCorpus,
} from "./paidProSignerStagingDisplayCorpus";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import {
  evaluatePaidProSourceOfTruthEstablishment,
  logPaidProSourceOfTruthEstablishmentAttempt,
} from "./paidProSessionEligibility";
import {
  preparePaidProFreezeCandidateText,
  assertPaidProFreezeCandidateGates,
} from "./paidProFreezeCandidate";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";

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

export type PaidProDocumentCorpusSource = PaidProFinalHydratedCorpusSource;

export type PaidProDocumentForSurface = {
  text: string;
  hash: string;
  source: PaidProDocumentCorpusSource;
  surface: PaidProDocumentSurface;
  executionBlockAppended: boolean;
  signerMetadataApplied: boolean;
};

export type PaidProCorpusInvariant = {
  accepted_len: number;
  displayed_len: number;
  copied_len: number;
  review_len: number;
  finalized_len: number;
  vs01_len: number;
  accepted_hash: string;
  displayed_hash: string;
  copied_hash: string;
  review_hash: string;
  finalized_hash: string;
  vs01_hash: string;
  displayed_matches: boolean;
  copied_matches: boolean;
  review_matches: boolean;
  finalized_matches: boolean;
  vs01_matches_or_execution_only: boolean;
};

let paidProSourceOfTruth: PaidProSourceOfTruth | null = null;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function hashPaidProCorpus(text: string): string {
  return fingerprintAgreementBody(text || "");
}

export function clearPaidProSourceOfTruth(): void {
  const oldText = paidProSourceOfTruth?.text ?? "";
  paidProSourceOfTruth = null;
  clearAuthoritativeAgreementDocument();
  clearFrozenCanonicalAgreementCorpus();
  clearPaidProSignerStagingDisplayCorpus();
  clearPaidProReviewRenderFusedRepairCache();
  clearPaidProPinnedSignerAppliedCorpus();
  clearPaidProVisibleRenderMemo();
  clearAcceptedProCorpusSafeDisplayCacheForTests();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  resetPaidProCorpusLifecycleDiffForTests();
  tracePaidProCorpusMutation({
    store: "paidProSourceOfTruth",
    caller: "clearPaidProSourceOfTruth",
    stage: "clear",
    oldText,
    newText: "",
    sourceBefore: "server_full_draft",
    sourceAfter: null,
  });
}

export function getPaidProSourceOfTruth(): PaidProSourceOfTruth | null {
  return paidProSourceOfTruth;
}

export function getPaidProSourceOfTruthText(): string {
  return paidProSourceOfTruth?.text ?? "";
}

export function hasPaidProSourceOfTruth(): boolean {
  return Boolean(paidProSourceOfTruth?.text && paidProSourceOfTruth.text.length >= 500);
}

/**
 * Pipeline render sources that represent a rejected / unusable / recoverable corpus. None of these
 * may ever be committed as the paid Pro Source of Truth — doing so lets a short rejected/fallback
 * body masquerade as the authoritative agreement and leaks guided/starter surfaces back in.
 */
const FORBIDDEN_PAID_PRO_SOT_SOURCES: ReadonlySet<string> = new Set([
  "rejected_paid_corpus",
  "premium_network_retryable",
  "premium_generation_retryable",
  "fallback_preview",
  "fallback_preview_error",
  "stale_intake",
]);

export function establishPaidProSourceOfTruth(args: {
  text: string;
  source?: string;
  accepted_at?: number;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  reviewSessionId?: string | null;
  agreementGenerationId?: string | null;
  generationOutcome?: string | null;
  /** User-approved revisions may legitimately shorten the body; automated paths may not. Default false. */
  allowShorterOverwrite?: boolean;
}): PaidProSourceOfTruth {
  const sotBefore = paidProSourceOfTruth?.text ?? "";
  const sourceBefore = paidProSourceOfTruth?.source ?? null;
  const requestedSource = (args.source ?? "server_full_draft").trim();
  // Minimum commit gate: a rejected/recoverable/fallback corpus must never become the SoT, no matter
  // how long its body is — this is the last line of defense against a short rejected corpus leaking in.
  if (FORBIDDEN_PAID_PRO_SOT_SOURCES.has(requestedSource)) {
    throw new Error(`[paid-pro-sot-commit-blocked] forbidden source: ${requestedSource}`);
  }
  const establishmentGate = evaluatePaidProSourceOfTruthEstablishment({
    source: requestedSource,
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    allowUserApprovedRevision: Boolean(args.allowShorterOverwrite),
    hasExistingSourceOfTruth: Boolean(paidProSourceOfTruth?.text),
  });
  logPaidProSourceOfTruthEstablishmentAttempt({
    source: requestedSource,
    allowed: establishmentGate.allowed,
    reason: establishmentGate.reason,
    hasProEntitlement: establishmentGate.hasProEntitlement,
    hasFreeStarterSession: establishmentGate.hasFreeStarterSession,
    generationId: establishmentGate.generationId,
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    textLen: trim(args.text).length,
  });
  if (!establishmentGate.allowed) {
    throw new Error(`[paid-pro-sot-establishment-suppressed] ${establishmentGate.reason}`);
  }
  // First-authoritative-success-wins latch: once a substantive SoT is committed, a later automated
  // premium response (e.g. a duplicate request that came back degraded/json_parse) must never
  // overwrite, downgrade, or shorten it. Equal/longer bodies (and execution-block appends) may proceed;
  // genuine user-approved revisions opt in via `allowShorterOverwrite`.
  const existingSot = paidProSourceOfTruth;
  if (existingSot && !args.allowShorterOverwrite) {
    const incomingLen = trim(args.text).length;
    const sameOrLonger =
      incomingLen >= existingSot.text.length ||
      differsOnlyByExecutionAppend(existingSot.text, trim(args.text));
    if (!sameOrLonger) {
      logProCorpusSourceMap({
        stage: "sot_overwrite_blocked_downgrade",
        source: requestedSource,
        len: incomingLen,
        text: args.text,
        allowedToOverride: false,
        reason: "first_authoritative_success_wins",
      });
      tracePaidProCorpusMutation({
        store: "paidProSourceOfTruth",
        caller: "establishPaidProSourceOfTruth",
        stage: "sot_overwrite_blocked_downgrade",
        surface: requestedSource,
        oldText: sotBefore,
        newText: existingSot.text,
        sourceBefore,
        sourceAfter: existingSot.source,
      });
      return existingSot;
    }
  }
  const prep = preparePaidProFreezeCandidateText({
    text: args.text,
    source: requestedSource,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    agreementGenerationId: args.agreementGenerationId,
    generationOutcome: args.generationOutcome,
    reviewSessionId: args.reviewSessionId,
    surface: "establish_paid_pro_source_of_truth",
  });
  logProCorpusSourceMap({
    stage: "server_full_draft_received",
    source: args.source ?? "server_full_draft",
    len: prep.text.length,
    text: prep.text,
    allowedToOverride: false,
    reason: "paid_pro_freeze_candidate_prepared",
  });
  const minimumSubstance = validateProMinimumSubstance({
    text: prep.text,
    rawIntake: args.intakeText ?? "",
    draft: args.draft ?? null,
    source: requestedSource,
  });
  const intakeHasConcreteServicesFacts =
    /\b(?:ai|artificial intelligence|workflow|automation)\b/i.test(args.intakeText ?? "") &&
    /\b(?:ai|artificial intelligence|workflow|automation)\b/i.test(args.draft?.purpose ?? "");
  const pipelineAcceptedAfterSubstance =
    hasPaidProPipelineSessionAcceptance({
      text: prep.text,
      source: requestedSource,
    }) ||
    hasPaidProPipelineSessionAcceptance({
      text: trim(args.text),
      source: requestedSource,
    });
  const wireLen = trim(args.text).length;
  const substantiveServerDraft =
    requestedSource === "server_full_draft" && wireLen >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;
  if (minimumSubstance.applies && !minimumSubstance.ok) {
    if (pipelineAcceptedAfterSubstance) {
      logProCorpusSourceMap({
        stage: "client_gates_passed",
        source: requestedSource,
        len: prep.text.length,
        text: prep.text,
        allowedToOverride: false,
        reason: `minimum_substance_advisory_after_pipeline_accept;malformedOpening=${minimumSubstance.malformedOpening};missing=${minimumSubstance.missingSections.join(",") || "none"}`,
      });
    } else if (substantiveServerDraft && minimumSubstance.missingSections.length === 0) {
      logProCorpusSourceMap({
        stage: "client_gates_passed",
        source: requestedSource,
        len: prep.text.length,
        text: prep.text,
        allowedToOverride: false,
        reason: `minimum_substance_advisory_substantive_server;malformedOpening=${minimumSubstance.malformedOpening};docLen=${wireLen}`,
      });
    } else if (intakeHasConcreteServicesFacts && minimumSubstance.missingSections.length > 0) {
      throw new Error(
        `[pro-minimum-substance-blocked] missingSections=${minimumSubstance.missingSections.join(",")}`,
      );
    } else if (
      intakeHasConcreteServicesFacts &&
      minimumSubstance.malformedOpening &&
      !substantiveServerDraft
    ) {
      throw new Error("[pro-minimum-substance-blocked] malformedOpening=true");
    }
  }
  logProCorpusSourceMap({
    stage: "client_gates_passed",
    source: args.source ?? "server_full_draft",
    len: prep.text.length,
    text: prep.text,
    allowedToOverride: false,
    reason: "paid_pro_freeze_candidate_prepared",
  });
  const reviewParties = prep.reviewParties;
  const parties = prep.parties;
  const partyNames = parties.map((p) => p.name);
  let safeForCommit = assertPaidProFreezeCandidateGates(prep, {
    text: args.text,
    source: requestedSource,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    agreementGenerationId: args.agreementGenerationId,
    generationOutcome: args.generationOutcome,
    reviewSessionId: args.reviewSessionId,
    surface: "establish_paid_pro_source_of_truth",
  });
  const authoritativeSignerCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText ?? null,
    draftParties: parties,
    manifestPartyCount: parties.length,
  }).count;
  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_establish",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: safeForCommit }],
    intakeText: args.intakeText ?? null,
    parties,
    signerState: { complete: false, signerCount: authoritativeSignerCount },
    minLen: 500,
    reviewSessionId: args.reviewSessionId,
    forceAuthoritativePreservation: true,
  });
  let snapshotForFreeze = snapshot;
  if (!snapshot.integrityOk || snapshot.placeholderIssues.length > 0) {
    const noticeRetry = applyPaidProNoticeContactAuthority(safeForCommit, {
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
      surface: "establish_paid_pro_source_of_truth_snapshot_retry",
      blockOnUnresolved: false,
    });
    if (noticeRetry.repairs.length > 0) {
      safeForCommit = assertPaidProFreezeCandidateGates(
        { ...prep, text: noticeRetry.text, hash: hashPaidProCorpus(noticeRetry.text) },
        {
          text: noticeRetry.text,
          source: requestedSource,
          draft: args.draft ?? null,
          intakeText: args.intakeText ?? null,
          agreementGenerationId: args.agreementGenerationId,
          generationOutcome: args.generationOutcome,
          reviewSessionId: args.reviewSessionId,
          surface: "establish_paid_pro_source_of_truth_snapshot_retry",
        },
      );
      snapshotForFreeze = buildCanonicalAgreementSnapshot({
        surface: "paid_pro_source_of_truth_establish_retry",
        tier: "pro",
        candidates: [{ source: "server_full_document_text", text: safeForCommit }],
        intakeText: args.intakeText ?? null,
        parties,
        signerState: { complete: false, signerCount: authoritativeSignerCount },
        minLen: 500,
        reviewSessionId: args.reviewSessionId,
        forceAuthoritativePreservation: true,
      });
    }
  }
  if (!snapshotForFreeze.integrityOk || snapshotForFreeze.placeholderIssues.length > 0) {
    logPreFreezePlaceholderRejectionDetails(safeForCommit, snapshotForFreeze.placeholderIssues, {
      intakeRaw: args.intakeText ?? "",
      partyNames,
    });
    throw new Error(
      `[paid-pro-sot-freeze-blocked] integrityOk=${snapshotForFreeze.integrityOk} placeholders=${snapshotForFreeze.placeholderIssues.join(",") || "none"}`,
    );
  }
  const frozen = freezeCanonicalAgreementSnapshot(snapshotForFreeze, "server_full_document_text");
  const frozenText = frozen?.canonicalText ?? safeForCommit;
  const preEstablishFreezeHash = frozen?.hash ?? null;
  const driftGuard = enforceAuthoritativeProCorpusDisplay({
    authoritativeText: safeForCommit,
    displayText: frozenText,
    source: "canonical_freeze",
    surface: "paid_pro_source_of_truth_establish",
  });
  const acceptedCorpusText = driftGuard.displayText;
  const acceptedCorpusHash = hashPaidProCorpus(acceptedCorpusText);
  if (preEstablishFreezeHash && preEstablishFreezeHash !== acceptedCorpusHash) {
    logCanonicalEstablishReconcile({
      surface: "paid_pro_source_of_truth_establish",
      classification: "canonical_refreeze",
      preFreezeHash: preEstablishFreezeHash,
      postFreezeHash: acceptedCorpusHash,
      preFreezeLen: frozenText.length,
      postFreezeLen: acceptedCorpusText.length,
      preFreezePlain: frozenText,
      postFreezePlain: acceptedCorpusText,
    });
    const reconcileSnapshot = buildCanonicalAgreementSnapshot({
      surface: "paid_pro_source_of_truth_establish",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: acceptedCorpusText }],
      intakeText: args.intakeText ?? null,
      parties,
      signerState: { complete: false, signerCount: authoritativeSignerCount },
      minLen: 500,
      reviewSessionId: args.reviewSessionId,
      forceAuthoritativePreservation: true,
    });
    freezeCanonicalAgreementSnapshot(reconcileSnapshot, "server_full_document_text");
  }
  logProCorpusSourceMap({
    stage: "authoritative_pro_freeze",
    source: "server_full_draft",
    len: acceptedCorpusText.length,
    text: acceptedCorpusText,
    hash: acceptedCorpusHash,
    allowedToOverride: false,
    reason: driftGuard.blocked ? "drift_blocked_used_authoritative" : "canonical_freeze",
  });
  const record: PaidProSourceOfTruth = {
    text: acceptedCorpusText,
    hash: acceptedCorpusHash,
    accepted_at: args.accepted_at ?? Date.now(),
    source: "server_full_draft",
    reviewSessionId: frozen?.reviewSessionId,
    signerManifestHash: frozen?.signerManifestHash,
  };
  logLawdogOutputPathMap({
    stage: "paid_pro_freeze",
    source: record.source,
    text: record.text,
    canMutateBody: false,
    canRejectBody: true,
    canFallback: false,
    reason: "authoritative_source_of_truth_established",
  });
  paidProSourceOfTruth = record;
  logExecutionBlockLocation(record.text, "paid_pro_source_of_truth_establish");
  logExecutionBlockCount(record.text, "paid_pro_source_of_truth_establish");
  logPostFreezeCorpusDrift({
    surface: "paid_pro_source_of_truth_establish",
    renderedText: record.text,
    frozenHash: record.hash,
    mutationSource:
      preEstablishFreezeHash && preEstablishFreezeHash !== acceptedCorpusHash
        ? "canonical_establish_reconcile"
        : undefined,
  });
  applyPaidProCanonicalDocumentStructureAuthority(record.text, {
    source: "establish_paid_pro_source_of_truth_post_freeze_check",
    phase: "post_freeze_check",
    log: true,
  });
  clearPaidProSignerStagingDisplayCorpus();
  clearPaidProReviewRenderFusedRepairCache();
  clearPaidProVisibleRenderMemo();
  if (args.allowShorterOverwrite) {
    clearPaidProPinnedSignerAppliedCorpus();
    clearAuthoritativeSigningSnapshot();
  }
  establishAuthoritativeAgreementDocument({
    fullCorpusText: acceptedCorpusText,
    canonicalPartyManifest: frozen?.signerManifest ?? parties,
    agreementMetadata: {
      title: args.draft?.title ?? null,
      agreementFamily: args.draft?.agreement_family ?? null,
      jurisdiction: args.draft?.jurisdiction ?? null,
      reviewSessionId: record.reviewSessionId ?? null,
    },
    generationMetadata: {
      source: "server_full_draft",
      acceptedAt: record.accepted_at,
      pipelineSource: args.source ?? "server_full_draft",
      rawAcceptedLen: trim(args.text).length,
    },
  });
  if (reviewParties.length >= 2) {
    setConsumedPaidProSignerMetadataAuthority({
      parties: [...reviewParties],
      source: "server_full_draft",
      hash: hashPaidProSignerMetadataAuthority(reviewParties),
      updatedAt: Date.now(),
    });
    writePremiumRecipientHandoffLinear(
      reviewParties.map((party) => ({
        name: party.partyLegalName,
        email: party.signerEmail,
        role: "party",
        signerName: party.signerName,
        signerTitle: party.signerTitle,
        partyAddress: party.partyAddress,
      })),
      reviewParties.length,
    );
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-source-of-truth]", {
      phase: "established",
      accepted_len: record.text.length,
      hash: record.hash,
      source: record.source,
    });
  }
  logPaidProFreezeEstablished({
    hash: record.hash,
    partyCount: reviewParties.length,
    signerCount: reviewParties.length,
  });
  tracePaidProCorpusMutation({
    store: "paidProSourceOfTruth",
    caller: "establishPaidProSourceOfTruth",
    stage: "establish",
    surface: requestedSource,
    oldText: sotBefore,
    newText: record.text,
    sourceBefore,
    sourceAfter: record.source,
  });
  return record;
}

export function hydratePaidProSourceOfTruth(args: {
  text?: string | null;
  hash?: string | null;
  accepted_at?: number | null;
  source?: string | null;
  reviewSessionId?: string | null;
  agreementGenerationId?: string | null;
}): PaidProSourceOfTruth | null {
  const text = trim(args.text);
  if (text.length < 500) return null;
  if ((args.source || "server_full_draft") !== "server_full_draft") return null;
  const establishmentGate = evaluatePaidProSourceOfTruthEstablishment({
    source: args.source ?? "server_full_draft",
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
  });
  logPaidProSourceOfTruthEstablishmentAttempt({
    source: "hydratePaidProSourceOfTruth",
    allowed: establishmentGate.allowed,
    reason: establishmentGate.reason,
    hasProEntitlement: establishmentGate.hasProEntitlement,
    hasFreeStarterSession: establishmentGate.hasFreeStarterSession,
    generationId: establishmentGate.generationId,
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    textLen: text.length,
  });
  if (!establishmentGate.allowed) return null;
  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_hydrate",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text }],
    minLen: 500,
    reviewSessionId: args.reviewSessionId ?? null,
  });
  const frozen = freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
  const record: PaidProSourceOfTruth = {
    text: frozen?.canonicalText ?? text,
    hash: frozen?.hash ?? (trim(args.hash) || hashPaidProCorpus(text)),
    accepted_at: args.accepted_at ?? Date.now(),
    source: "server_full_draft",
    reviewSessionId: frozen?.reviewSessionId,
    signerManifestHash: frozen?.signerManifestHash,
  };
  const hydrateBefore = paidProSourceOfTruth?.text ?? "";
  paidProSourceOfTruth = record;
  hydrateAuthoritativeAgreementDocument({
    fullCorpusText: record.text,
    authoritativeHash: record.hash,
    canonicalPartyManifest: frozen?.signerManifest ?? [],
    agreementMetadata: {
      reviewSessionId: record.reviewSessionId ?? null,
    },
    acceptedAt: record.accepted_at,
  });
  tracePaidProCorpusMutation({
    store: "paidProSourceOfTruth",
    caller: "hydratePaidProSourceOfTruth",
    stage: "hydrate",
    surface: args.source ?? "server_full_draft",
    oldText: hydrateBefore,
    newText: record.text,
    sourceBefore: null,
    sourceAfter: record.source,
  });
  return record;
}

export function getPaidProDisplayText(): string {
  return getPaidProSourceOfTruthText();
}

export function getPaidProVs01Text(opts?: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): string {
  void opts;
  return getPaidProSourceOfTruthText();
}

export function getPaidProDocumentForSurface(
  surface: PaidProDocumentSurface,
  opts?: {
    draft?: ParsedDraftShape | null;
    intakeText?: string | null;
    liveSignerMetadataUi?: import("./paidProSignerMetadataAuthority").LiveSignerMetadataUiState | null;
  },
): PaidProDocumentForSurface | null {
  const source = getPaidProSourceOfTruth();
  if (!source) return null;
  const hydrated = resolvePaidProFinalHydratedCorpusForSurface(surface, opts);
  let text = hydrated.text;
  let corpusSource = hydrated.source;
  let signerMetadataApplied = hydrated.signerMetadataApplied;

  if (!signerMetadataApplied) {
    const canonicalSurface: CanonicalAgreementSurface =
      surface === "signer_setup" ? "handoff" : surface;
    const authoritative = authoritativeDocumentForSurface(surface);
    const canonical = readCanonicalAgreementCorpusForSurface(canonicalSurface, {
      required: true,
      tier: "pro",
      allowPaidProAuthoritativeFallback: true,
    });
    const usedAuthoritativeFallback = !canonical?.canonicalText?.trim();
    text = authoritative?.fullCorpusText ?? canonical?.canonicalText ?? source.text;
    corpusSource = "paidProSourceOfTruth";
    if (usedAuthoritativeFallback && !hasFrozenCanonicalAgreementCorpus()) {
      logPaidProAuthoritativeDisplayFallback({
        surface,
        len: text.length,
        hash: source.hash,
        source: authoritative?.fullCorpusText ? "authoritative_agreement_document" : "server_full_draft",
      });
    }
    const driftGuard = enforceAuthoritativeProCorpusDisplay({
      authoritativeText: source.text,
      displayText: text,
      source: canonical?.sourceLabel ?? "canonical_surface_read",
      surface,
    });
    text = driftGuard.displayText;
  }

  if (text.length < PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    logFalseProAuthorityBlocked({
      source: corpusSource,
      corpusLen: text.length,
      surface: `paid_pro_surface:${surface}`,
    });
    return null;
  }
  let hash = hydrated.hash || hashPaidProCorpus(text);
  const stage =
    surface === "review"
      ? "pro_review_display"
      : surface === "signer_setup"
        ? "signature_prep_base"
        : surface === "vs01"
          ? "vs01_base"
          : surface === "copy"
            ? "review_link_payload"
            : "pro_review_display";
  logProCorpusSourceMap({
    stage,
    source: corpusSource,
    len: text.length,
    text,
    hash,
    allowedToOverride: false,
    reason: `surface:${surface}`,
  });
  const executionBlockAppended = false;
  if (
    surface === "review" ||
    surface === "copy" ||
    surface === "display" ||
    surface === "signer_setup" ||
    surface === "vs01" ||
    surface === "finalized"
  ) {
    const reviewCopyPlain = resolvePaidProReviewRenderPlain({
      ...opts,
      skipUserVisibleDisplayPrep: surface === "vs01",
      deferSignerMetadataRepair: shouldDeferPaidProReviewRenderSignerRepair({
        signerMetadataSessionActive: isPaidProReviewSignerMetadataSessionActive(),
      }),
    });
    const aligned = reviewCopyPlain;
    const preserveHydratedExecutionCorpus =
      hydrated.signerMetadataApplied &&
      (hydrated.source === "pinned_signer_applied_corpus" ||
        hydrated.source === "authoritative_signing_snapshot");
    if (aligned.length >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN && !preserveHydratedExecutionCorpus) {
      text = aligned;
      hash = hashPaidProCorpus(text);
      if (!signerMetadataApplied) {
        const partiesForGate = resolvePartiesForReviewRender(opts);
        if (consumedAuthoritySignerMetadataComplete(partiesForGate)) {
          signerMetadataApplied = true;
          corpusSource = "signer_hydrated_from_authority";
        }
      }
    }
  } else {
    const partiesForSanitizer = resolvePartiesForReviewRender(opts);
    if (partiesForSanitizer.length >= 2 && (signerMetadataApplied || paidProSignerExecutionCorpusIsFrozen())) {
      text = applyPaidProReviewRenderSanitizer(text, partiesForSanitizer, {
        intakeText: opts?.intakeText ?? null,
        draftPartyNames:
          opts?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
      }).text.trim();
      hash = hashPaidProCorpus(text);
    }
  }

  if (isPaidProUserVisibleDocumentSurface(surface)) {
    const displayPlain = resolvePaidProDisplayPlainForSurface({
      surface,
      sourcePlain: text,
      draft: (opts?.draft ?? null) as AgreementDraft | null,
      applySignerHydration: false,
      selectedSource: corpusSource,
    });
    if (displayPlain.length >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
      text = displayPlain;
      hash = hashPaidProCorpus(text);
    }
  }

  assertPaidProSurfaceCorpus({
    surface,
    text,
    actualSource: corpusSource,
    allowExecutionAppend: surface === "vs01",
    signerMetadataApplied,
  });
  const sotForTelemetry = getPaidProSourceOfTruth();
  if (sotForTelemetry && hash !== sotForTelemetry.hash) {
    logPaidProNormalizedSurfaceDiff(
      buildPaidProNormalizedSurfaceDiffPayload({
        surface,
        canonicalText: sotForTelemetry.text,
        normalizedText: text,
      }),
    );
  }
  logPaidProSurface({
    surface,
    len: text.length,
    hash,
    source: corpusSource,
    canonicalHash:
      resolvePaidProFrozenUserVisibleReviewDisplayHash({
        intakeText: opts?.intakeText ?? null,
        draft: opts?.draft ?? null,
      }) ??
      (shouldUsePaidProSourceOfTruthDisplayOnly()
        ? resolvePaidProFrozenDisplayAuthoritativeHash({
            intakeText: opts?.intakeText ?? null,
            draftPartyNames:
              opts?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
          })
        : null) ??
      sotForTelemetry?.hash ??
      hash,
    canonicalLen: sotForTelemetry?.text.length ?? text.length,
  });
  return {
    text,
    hash,
    source: corpusSource,
    surface,
    executionBlockAppended,
    signerMetadataApplied,
  };
}

export function logPaidProAuthoritativeDisplayFallback(payload: {
  surface: PaidProDocumentSurface;
  len: number;
  hash: string;
  source: string;
}): void {
  const shouldLog =
    import.meta.env?.MODE === "test" ||
    shouldLogPaidProAuthoritySurfaceEvent({
      event: "paid-pro-authoritative-display-fallback",
      surface: payload.surface,
      hash: payload.hash,
      source: payload.source,
    });
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-authoritative-display-fallback]", {
    surface: payload.surface,
    len: payload.len,
    hash: payload.hash,
    source: payload.source,
    reason: "canonical_corpus_missing_after_review_ready",
  });
}

function logPaidProSurface(payload: {
  surface: PaidProDocumentSurface;
  len: number;
  hash: string;
  source: PaidProDocumentCorpusSource;
  canonicalHash?: string | null;
  canonicalLen?: number | null;
}): void {
  const surfaceHash = payload.hash;
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "paid-pro-surface",
      surface: payload.surface,
      hash: surfaceHash,
      source: payload.source,
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-surface]", {
    surface: payload.surface,
    len: payload.len,
    hash: surfaceHash,
    normalizedHash: surfaceHash,
    canonicalHash: payload.canonicalHash ?? surfaceHash,
    canonicalLen: payload.canonicalLen ?? payload.len,
    lenDelta: payload.canonicalLen != null ? payload.len - payload.canonicalLen : 0,
    source: payload.source,
  });
}

export function assertPaidProSurfaceCorpus(args: {
  surface: PaidProDocumentSurface | string;
  text: string;
  actualSource: string;
  allowExecutionAppend?: boolean;
  signerMetadataApplied?: boolean;
}): void {
  if (
    paidProSurfaceCorpusMatchesAuthority({
      text: args.text,
      signerMetadataApplied: args.signerMetadataApplied,
      actualSource: args.actualSource,
      allowExecutionAppend: args.allowExecutionAppend,
    })
  ) {
    return;
  }
  const source = getPaidProSourceOfTruth();
  if (!source) return;
  const actualText = trim(args.text);
  const payload = {
    surface: args.surface,
    expectedHash: source.hash,
    actualHash: hashPaidProCorpus(actualText),
    actualSource: args.actualSource,
    expectedLen: source.text.length,
    actualLen: actualText.length,
    signerMetadataApplied: Boolean(args.signerMetadataApplied),
  };
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.warn("[paid-pro-surface-corpus-parity]", payload);
    logPaidProDriftCorpusCaptureOnce({
      surface: String(args.surface),
      expectedHash: payload.expectedHash,
      actualHash: payload.actualHash,
      actualSource: payload.actualSource,
    });
  }
}

function differsOnlyByExecutionAppend(base: string, candidate: string): boolean {
  const a = trim(base);
  const b = trim(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!b.startsWith(a)) return false;
  const tail = b.slice(a.length).trim();
  return /\b(IN WITNESS WHEREOF|SIGNATURE|EXECUTION)\b/i.test(tail);
}

export function logPaidProCorpusInvariant(args: {
  displayed?: string | null;
  copied?: string | null;
  review?: string | null;
  finalized?: string | null;
  vs01?: string | null;
}): PaidProCorpusInvariant | null {
  const source = getPaidProSourceOfTruth();
  if (!source) return null;
  const displayed = trim(args.displayed ?? source.text);
  const copied = trim(args.copied ?? displayed);
  const review = trim(args.review ?? displayed);
  const finalized = trim(args.finalized ?? review);
  const vs01 = trim(args.vs01 ?? source.text);
  const invariant: PaidProCorpusInvariant = {
    accepted_len: source.text.length,
    displayed_len: displayed.length,
    copied_len: copied.length,
    review_len: review.length,
    finalized_len: finalized.length,
    vs01_len: vs01.length,
    accepted_hash: source.hash,
    displayed_hash: hashPaidProCorpus(displayed),
    copied_hash: hashPaidProCorpus(copied),
    review_hash: hashPaidProCorpus(review),
    finalized_hash: hashPaidProCorpus(finalized),
    vs01_hash: hashPaidProCorpus(vs01),
    displayed_matches: hashPaidProCorpus(displayed) === source.hash,
    copied_matches: hashPaidProCorpus(copied) === source.hash,
    review_matches: hashPaidProCorpus(review) === source.hash,
    finalized_matches: hashPaidProCorpus(finalized) === source.hash,
    vs01_matches_or_execution_only:
      hashPaidProCorpus(vs01) === source.hash || differsOnlyByExecutionAppend(source.text, vs01),
  };
  const ok =
    invariant.displayed_matches &&
    invariant.copied_matches &&
    invariant.review_matches &&
    invariant.finalized_matches &&
    invariant.vs01_matches_or_execution_only;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    (ok ? console.info : console.error)(
      ok ? "[paid-pro-corpus-invariant]" : "[paid-pro-corpus-invariant-violation]",
      invariant,
    );
  }
  return invariant;
}
