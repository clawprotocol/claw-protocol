/**
 * Paid Pro source of truth.
 *
 * Once a paid Pro server_full_draft is accepted, this is the only agreement body
 * the frontend may display, copy, finalize, or send to signing unless the user
 * explicitly creates a revision.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { clearAcceptedProCorpusSafeDisplayCacheForTests } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";
import { resetPaidProCorpusLifecycleDiffForTests } from "./paidProCorpusLifecycleDiff";
import { validateProMinimumSubstance } from "./paidProConciseServicesQuality";
import {
  assessProfessionalProClauseCoverage,
  logProfessionalProClauseCoverageDecision,
} from "./paidProProfessionalClauseCoverage";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { readProGenerationAdoption } from "./paidProGenerationAdoption";
import {
  logPaidProSotEstablishmentDecision,
  resolvePaidProSotEstablishmentDecision,
} from "./paidProSotEstablishmentGate";
import {
  logPaidProSotEstablishmentNonfatalIssueWarn,
  logPreFreezePlaceholderRejectionDetails,
} from "./agreementTemplatePlaceholderSafety";
import {
  hasPaidProPipelineSessionAcceptance,
  latchPaidProPipelineAcceptanceForConciseAuthoritativeBody,
} from "./paidProPostAcceptanceValidatorCache";
import { PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  assessPaidProSubstantiveServerDraftCorpus,
  paidProServerFullDraftBelowSubstantiveMin,
} from "./paidProSubstantiveCorpusAssessment";
import { logFalseProAuthorityBlocked } from "./paidProRuntimeAuthorityEstablishment";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezePaidProEstablishedCanonicalSnapshot,
  freezeCanonicalAgreementSnapshot,
  hasFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
  type CanonicalAgreementSnapshot,
  type CanonicalAgreementSurface,
} from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruthState,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
  replacePaidProSourceOfTruth,
  type PaidProDocumentSurface,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruthState";

export {
  clearPaidProSourceOfTruthState,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
  type PaidProDocumentSurface,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruthState";
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
  latchPaidReviewSessionCanonicalSoTHash,
  markPaidReviewSessionPremiumGeneration,
} from "./paidProReviewSessionCorpusInvariantState";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
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
import { extendPaidProAuthorityHashContinuitySurface } from "./paidProAuthorityHashContinuity";
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
import { tracePaidProAcceptancePipelineStage } from "./paidProAcceptancePipelineTrace";
import {
  hashPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { writePremiumRecipientHandoffFromAuthorityParties, readPremiumRecipientHandoff, resolveHandoffPartySlotCount } from "./premiumPartyNamesHandoff";
import {
  overlayIntakeManifestOnReviewParties,
  intakePartyManifestIsAuthoritative,
} from "./intakePartyManifestAuthority";
import { establishCanonicalPartyMetadataAtStage } from "./canonicalPartyMetadataAuthority";
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
  evaluatePaidProFreezeCandidateGates,
} from "./paidProFreezeCandidate";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import {
  assertPaidProHydrateAuthorityInvariant,
  resolvePaidProHydrateStructuralContext,
} from "./paidProHydrateAuthority";

function buildPaidProSotCanonicalSnapshotArgs(args: {
  surface: string;
  safeForCommit: string;
  intakeText?: string | null;
  parties: Array<{ name: string; role?: string | null; email?: string | null; partyAddress?: string | null }>;
  reviewParties: ReturnType<typeof preparePaidProFreezeCandidateText>["reviewParties"];
  authoritativeSignerCount: number;
  reviewSessionId?: string | null;
  draft?: ParsedDraftShape | null;
  freezeGatesPassed: boolean;
}): Parameters<typeof buildCanonicalAgreementSnapshot>[0] {
  const draftPartyNames = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter(Boolean);
  const handoffPartySlots = (() => {
    const handoff = readPremiumRecipientHandoff();
    if (!handoff) return args.reviewParties.length;
    return resolveHandoffPartySlotCount(handoff, args.reviewParties.length);
  })();
  const structuralParties = resolveNoticeStructuralValidationParties(args.reviewParties, {
    intakeText: args.intakeText ?? null,
    draftPartyNames,
    acceptedCorpus: args.safeForCommit,
  });
  return {
    surface: args.surface,
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: args.safeForCommit }],
    intakeText: args.intakeText ?? null,
    parties: args.parties,
    signerState: { complete: false, signerCount: args.authoritativeSignerCount },
    minLen: 500,
    reviewSessionId: args.reviewSessionId,
    forceAuthoritativePreservation: true,
    skipClauseFamilyPlaceholderIssues: args.freezeGatesPassed,
    clauseFamilyStructuralContext: {
      parties: structuralParties,
      draftPartyCount: args.draft?.parties?.length ?? args.parties.length,
      intakeText: args.intakeText ?? null,
      draftPartyNames,
      acceptedCorpus: args.safeForCommit,
      handoffPartySlots,
    },
  };
}

function resolvePaidProSotEstablishmentHashes(args: {
  safeForCommit: string;
  acceptedFreezeHash?: string | null;
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): { acceptedFreezeHash: string | null; adoptedHash: string | null; sotCandidateHash: string } {
  const sotCandidateHash =
    paidProPipelineAcceptedCorpusHash(args.safeForCommit) ?? hashPaidProCorpus(args.safeForCommit);
  const adopted = readProGenerationAdoption(
    args.agreementGenerationId ?? null,
    args.intakeFingerprint ?? null,
  );
  return {
    acceptedFreezeHash: args.acceptedFreezeHash ?? primaryFreezeGateHashOrNull(args.safeForCommit),
    adoptedHash: adopted?.hash ?? adopted?.freezeCandidateHash ?? null,
    sotCandidateHash,
  };
}

function primaryFreezeGateHashOrNull(text: string): string | null {
  return paidProPipelineAcceptedCorpusHash(text);
}

function evaluatePaidProSotEstablishmentForSnapshot(args: {
  snapshot: CanonicalAgreementSnapshot;
  safeForCommit: string;
  freezeGatesPassed: boolean;
  acceptedFreezeHash: string | null;
  adoptedHash: string | null;
  intakeRaw: string;
  partyNames: readonly string[];
  surface: string;
}) {
  const decision = resolvePaidProSotEstablishmentDecision({
    snapshot: args.snapshot,
    corpusText: args.safeForCommit,
    freezeGatesPassed: args.freezeGatesPassed,
    acceptedFreezeHash: args.acceptedFreezeHash,
    adoptedHash: args.adoptedHash,
    intakeRaw: args.intakeRaw,
    partyNames: args.partyNames,
  });
  logPaidProSotEstablishmentDecision(decision, args.surface);
  if (decision.warnOnly) {
    logPaidProSotEstablishmentNonfatalIssueWarn(args.safeForCommit, decision.placeholderIssueCodes, {
      intakeRaw: args.intakeRaw,
      partyNames: args.partyNames,
      surface: args.surface,
      corpusHash: decision.sotCandidateHash,
      freezeGatesPassed: decision.freezeGatesPassed,
      snapshotIntegrityOk: args.snapshot.integrityOk,
      acceptedFreezeHash: decision.acceptedFreezeHash,
      adoptedHash: decision.adoptedHash,
      canonicalSnapshotSelectedHash: decision.canonicalSnapshotSelectedHash,
      sotCandidateHash: decision.sotCandidateHash,
    });
  }
  return decision;
}

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

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function clearPaidProSourceOfTruth(): void {
  const oldText = clearPaidProSourceOfTruthState()?.text ?? "";
  clearPaidProReviewSessionAuthorityForTests();
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
  "premium_degraded_server_local_recovery",
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
  const sotBefore = getPaidProSourceOfTruth()?.text ?? "";
  const sourceBefore = getPaidProSourceOfTruth()?.source ?? null;
  const requestedSource = (args.source ?? "server_full_draft").trim();
  /**
   * Premium generation is marked under `agreementGenerationId` in ensurePremiumCompletion.
   * Canonical freeze must use that same session key. Falling through to `review-${hash}`
   * (when reviewSessionId is omitted) makes applySuccess throw and leaves SoT hash null.
   */
  const reviewSessionId =
    (args.reviewSessionId ?? args.agreementGenerationId ?? getOrInitSessionAgreementGenerationId()).trim() ||
    getOrInitSessionAgreementGenerationId();
  // Rematerialize mark under the exact key freeze will use (covers ensure/establish id skew).
  markPaidReviewSessionPremiumGeneration(reviewSessionId, "establish_paid_pro_source_of_truth");
  // Minimum commit gate: a rejected/recoverable/fallback corpus must never become the SoT, no matter
  // how long its body is — this is the last line of defense against a short rejected corpus leaking in.
  if (FORBIDDEN_PAID_PRO_SOT_SOURCES.has(requestedSource)) {
    throw new Error(`[paid-pro-sot-commit-blocked] forbidden source: ${requestedSource}`);
  }
  const establishmentGate = evaluatePaidProSourceOfTruthEstablishment({
    source: requestedSource,
    agreementGenerationId: args.agreementGenerationId ?? reviewSessionId,
    allowUserApprovedRevision: Boolean(args.allowShorterOverwrite),
    hasExistingSourceOfTruth: Boolean(getPaidProSourceOfTruth()?.text),
    pipelineSessionAccepted: hasPaidProPipelineSessionAcceptance({
      text: trim(args.text),
      source: requestedSource,
    }),
  });
  logPaidProSourceOfTruthEstablishmentAttempt({
    source: requestedSource,
    allowed: establishmentGate.allowed,
    reason: establishmentGate.reason,
    hasProEntitlement: establishmentGate.hasProEntitlement,
    hasFreeStarterSession: establishmentGate.hasFreeStarterSession,
    generationId: establishmentGate.generationId,
    agreementGenerationId: args.agreementGenerationId ?? reviewSessionId,
    textLen: trim(args.text).length,
  });
  if (!establishmentGate.allowed) {
    throw new Error(`[paid-pro-sot-establishment-suppressed] ${establishmentGate.reason}`);
  }
  const wireLen = trim(args.text).length;
  const generationOutcome = trim(args.generationOutcome).toLowerCase();
  // First-authoritative-success-wins latch: a later automated duplicate/degraded/re-prep response
  // must not overwrite a substantive SoT — including longer multiparty rewrite on reload.
  // User-approved revisions pass allowShorterOverwrite. Execution-only append remains allowed.
  const existingSot = getPaidProSourceOfTruth();
  if (existingSot && !args.allowShorterOverwrite) {
    const incoming = trim(args.text);
    const incomingHash = hashPaidProCorpus(incoming);
    if (incoming === existingSot.text || incomingHash === existingSot.hash) {
      return existingSot;
    }
    const executionOnlyAppend = differsOnlyByExecutionAppend(existingSot.text, incoming);
    if (!executionOnlyAppend) {
      logProCorpusSourceMap({
        stage: "sot_overwrite_blocked_post_acceptance",
        source: requestedSource,
        len: incoming.length,
        text: args.text,
        allowedToOverride: false,
        reason: "first_authoritative_success_wins",
      });
      tracePaidProCorpusMutation({
        store: "paidProSourceOfTruth",
        caller: "establishPaidProSourceOfTruth",
        stage: "sot_overwrite_blocked_post_acceptance",
        surface: requestedSource,
        oldText: sotBefore,
        newText: existingSot.text,
        sourceBefore,
        sourceAfter: existingSot.source,
      });
      return existingSot;
    }
  }
  latchPaidProPipelineAcceptanceForConciseAuthoritativeBody({
    text: trim(args.text),
    source: requestedSource,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
  });
  const substantiveAssessment = assessPaidProSubstantiveServerDraftCorpus({
    text: trim(args.text),
    source: requestedSource,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
    generationOutcome: args.generationOutcome ?? null,
  });
  const pipelineSessionAccepted = hasPaidProPipelineSessionAcceptance({
    text: trim(args.text),
    source: requestedSource,
  });
  const mislabeledSubstantiveServerSource =
    paidProServerFullDraftBelowSubstantiveMin({
      text: trim(args.text),
      source: requestedSource,
      intakeText: args.intakeText ?? null,
      draft: args.draft ?? null,
      generationOutcome: args.generationOutcome ?? null,
    }) &&
    !args.allowShorterOverwrite &&
    !pipelineSessionAccepted;
  if (mislabeledSubstantiveServerSource) {
    throw new Error(
      `[paid-pro-sot-establishment-blocked] mislabeled_server_full_draft_below_substantive_min;len=${wireLen};classification=${substantiveAssessment.classification}`,
    );
  }
  if (
    generationOutcome === "degraded" &&
    wireLen < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN &&
    (requestedSource === "server_full_draft" || requestedSource === "server_full_draft_degraded") &&
    !args.allowShorterOverwrite &&
    !pipelineSessionAccepted &&
    !substantiveAssessment.qualifiesForServerFullDraftAcceptance
  ) {
    throw new Error(
      `[paid-pro-sot-establishment-blocked] degraded_response_without_substantive_server_full;len=${wireLen}`,
    );
  }
  const prep = preparePaidProFreezeCandidateText({
    text: args.text,
    source: requestedSource,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    agreementGenerationId: args.agreementGenerationId,
    generationOutcome: args.generationOutcome,
    reviewSessionId,
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
  const professionalCoverage = assessProfessionalProClauseCoverage({
    text: prep.text,
    intake: args.intakeText ?? "",
  });
  if (professionalCoverage.applies && !professionalCoverage.ok) {
    logProfessionalProClauseCoverageDecision({
      accepted: false,
      docLen: professionalCoverage.docLen,
      missingClauses: professionalCoverage.missingClauses,
      source: requestedSource,
    });
    throw new Error(
      `[professional-pro-clause-coverage-blocked] missing=${professionalCoverage.missingClauses.join(",")};len=${professionalCoverage.docLen}`,
    );
  }
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
  const substantiveServerDraft =
    requestedSource === "server_full_draft" &&
    (wireLen >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN ||
      substantiveAssessment.qualifiesForServerFullDraftAcceptance);
  if (minimumSubstance.applies && !minimumSubstance.ok) {
    if (pipelineAcceptedAfterSubstance && !(professionalCoverage.applies && !professionalCoverage.ok)) {
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
  const freezeGateArgs = {
    text: args.text,
    source: requestedSource,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    agreementGenerationId: args.agreementGenerationId,
    generationOutcome: args.generationOutcome,
    reviewSessionId,
    surface: "establish_paid_pro_source_of_truth",
  };
  const primaryFreezeGate = evaluatePaidProFreezeCandidateGates(prep, freezeGateArgs);
  if (!primaryFreezeGate.ok) {
    throw new Error(
      `[paid-pro-sot-establishment-blocked] ${primaryFreezeGate.rejectReason ?? "freeze_gates_failed"}`,
    );
  }
  let safeForCommit = primaryFreezeGate.text;
  let freezeGatesPassed = primaryFreezeGate.ok;
  let acceptedFreezeHash = primaryFreezeGate.hash ?? null;
  const authoritativeSignerCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText ?? null,
    draftParties: parties,
    manifestPartyCount: parties.length,
  }).count;
  const intakeRaw = args.intakeText ?? "";
  const hashBundle = () =>
    resolvePaidProSotEstablishmentHashes({
      safeForCommit,
      acceptedFreezeHash,
      agreementGenerationId: args.agreementGenerationId ?? null,
    });

  let snapshotForFreeze = buildCanonicalAgreementSnapshot(
    buildPaidProSotCanonicalSnapshotArgs({
      surface: "paid_pro_source_of_truth_establish",
      safeForCommit,
      intakeText: args.intakeText,
      parties,
      reviewParties,
      authoritativeSignerCount,
      reviewSessionId,
      draft: args.draft ?? null,
      freezeGatesPassed,
    }),
  );
  let establishmentDecision = evaluatePaidProSotEstablishmentForSnapshot({
    snapshot: snapshotForFreeze,
    safeForCommit,
    freezeGatesPassed,
    acceptedFreezeHash: hashBundle().acceptedFreezeHash,
    adoptedHash: hashBundle().adoptedHash,
    intakeRaw,
    partyNames,
    surface: "establish_paid_pro_source_of_truth",
  });

  if (establishmentDecision.blocked) {
    const noticeRetry = applyPaidProNoticeContactAuthority(safeForCommit, {
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
      surface: "establish_paid_pro_source_of_truth_snapshot_retry",
      blockOnUnresolved: false,
    });
    if (noticeRetry.repairs.length > 0) {
      const retryGate = evaluatePaidProFreezeCandidateGates(
        { ...prep, text: noticeRetry.text, hash: hashPaidProCorpus(noticeRetry.text) },
        {
          ...freezeGateArgs,
          text: noticeRetry.text,
          surface: "establish_paid_pro_source_of_truth_snapshot_retry",
        },
      );
      if (!retryGate.ok) {
        throw new Error(
          `[paid-pro-sot-establishment-blocked] ${retryGate.rejectReason ?? "freeze_gates_failed"}`,
        );
      }
      safeForCommit = retryGate.text;
      freezeGatesPassed = retryGate.ok;
      acceptedFreezeHash = retryGate.hash ?? acceptedFreezeHash;
      snapshotForFreeze = buildCanonicalAgreementSnapshot(
        buildPaidProSotCanonicalSnapshotArgs({
          surface: "paid_pro_source_of_truth_establish_retry",
          safeForCommit,
          intakeText: args.intakeText,
          parties,
          reviewParties,
          authoritativeSignerCount,
          reviewSessionId,
          draft: args.draft ?? null,
          freezeGatesPassed,
        }),
      );
      establishmentDecision = evaluatePaidProSotEstablishmentForSnapshot({
        snapshot: snapshotForFreeze,
        safeForCommit,
        freezeGatesPassed,
        acceptedFreezeHash: hashBundle().acceptedFreezeHash,
        adoptedHash: hashBundle().adoptedHash,
        intakeRaw,
        partyNames,
        surface: "establish_paid_pro_source_of_truth_retry",
      });
    }
  }

  if (establishmentDecision.blocked) {
    logPreFreezePlaceholderRejectionDetails(safeForCommit, snapshotForFreeze.placeholderIssues, {
      intakeRaw,
      partyNames,
      surface: "establish_paid_pro_source_of_truth",
      corpusHash: establishmentDecision.sotCandidateHash,
      freezeGatesPassed,
      snapshotIntegrityOk: snapshotForFreeze.integrityOk,
      blockedBy: establishmentDecision.blockedBy,
    });
    throw new Error(
      `[paid-pro-sot-freeze-blocked] integrityOk=${snapshotForFreeze.integrityOk} placeholders=${snapshotForFreeze.placeholderIssues.join(",") || "none"} blockedBy=${establishmentDecision.blockedBy ?? "unknown"}`,
    );
  }

  const forceFreeze =
    freezeGatesPassed &&
    (establishmentDecision.warnOnly || !snapshotForFreeze.integrityOk);
  const frozen = freezePaidProEstablishedCanonicalSnapshot(
    snapshotForFreeze,
    "server_full_document_text",
    forceFreeze,
  );
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
    const reconcileSnapshot = buildCanonicalAgreementSnapshot(
      buildPaidProSotCanonicalSnapshotArgs({
        surface: "paid_pro_source_of_truth_establish",
        safeForCommit: acceptedCorpusText,
        intakeText: args.intakeText,
        parties,
        reviewParties,
        authoritativeSignerCount,
        reviewSessionId,
        draft: args.draft ?? null,
        freezeGatesPassed: true,
      }),
    );
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
  replacePaidProSourceOfTruth(record);
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
  const authoritativeDoc = authoritativeDocumentForSurface("paid_pro_source_of_truth_establish");
  extendPaidProAuthorityHashContinuitySurface({
    canonicalSnapshotHash: frozen?.hash ?? record.hash,
    authoritativeSnapshotHash: authoritativeDoc?.authoritativeHash ?? record.hash,
  });
  let establishedHandoffPartyCount = reviewParties.length;
  if (reviewParties.length >= 2) {
    const handoffParties = overlayIntakeManifestOnReviewParties(args.intakeText ?? null, reviewParties);
    establishedHandoffPartyCount = handoffParties.length;
    setConsumedPaidProSignerMetadataAuthority({
      parties: [...handoffParties],
      source: "server_full_draft",
      hash: hashPaidProSignerMetadataAuthority(handoffParties),
      updatedAt: Date.now(),
    });
    writePremiumRecipientHandoffFromAuthorityParties(handoffParties);
    if (intakePartyManifestIsAuthoritative(args.intakeText ?? null)) {
      establishCanonicalPartyMetadataAtStage({
        stage: "after-freeze",
        legalEntities: handoffParties.map((p) => p.partyLegalName),
        intakeText: args.intakeText ?? null,
        uiParties: handoffParties,
        mutationSource: "structured_intake",
        project: false,
      });
    }
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
    partyCount: establishedHandoffPartyCount,
    signerCount: establishedHandoffPartyCount,
  });
  latchPaidReviewSessionCanonicalSoTHash({
    reviewSessionId: record.reviewSessionId,
    canonicalPlain: record.text,
  });
  try {
    establishPaidProReviewSessionAuthority({
      corpusPlain: record.text,
      source: requestedSource,
      integrityOk: true,
      reviewSessionId: record.reviewSessionId ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("one_authority_violation")) throw err;
    // First integrity-valid accept wins — competing freeze candidates must not replace it.
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.error("[paid-pro-review-session-authority]", {
        phase: "one_authority_violation_ignored",
        message: message.slice(0, 180),
      });
    }
  }
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
  tracePaidProAcceptancePipelineStage({
    stage: "after_establishPaidProSourceOfTruth",
    source: record.source,
    text: record.text,
    rawIntake: args.intakeText ?? null,
    draft: args.draft ?? null,
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
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): PaidProSourceOfTruth | null {
  const text = trim(args.text);
  if (text.length < 500) return null;
  const source = trim(args.source) || "server_full_draft";
  if (source !== "server_full_draft" && source !== "server_full_draft_degraded") return null;
  const existingSoT = getPaidProSourceOfTruth();
  const incomingHash = trim(args.hash) || hashPaidProCorpus(text);
  // Same-tab reload/hydrate after establish: do not re-freeze under a divergent review-${hash} key.
  if (existingSoT && existingSoT.hash === incomingHash && trim(existingSoT.text) === text) {
    return existingSoT;
  }
  /**
   * Hydrate must use the same session key ensurePremiumCompletion marked.
   * Prefer explicit ids, then the established SoT session, then the active generation id —
   * never invent `review-${hash}` when a generation session already owns the mark.
   */
  const reviewSessionId =
    (
      args.reviewSessionId ||
      args.agreementGenerationId ||
      existingSoT?.reviewSessionId ||
      getOrInitSessionAgreementGenerationId() ||
      ""
    ).trim() || getOrInitSessionAgreementGenerationId();
  if (
    text.length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN &&
    !hasPaidProPipelineSessionAcceptance({ text, source }) &&
    !trim(args.hash)
  ) {
    return null;
  }
  const establishmentGate = evaluatePaidProSourceOfTruthEstablishment({
    source: args.source ?? "server_full_draft",
    agreementGenerationId: args.agreementGenerationId ?? reviewSessionId,
    pipelineSessionAccepted: hasPaidProPipelineSessionAcceptance({ text, source }),
  });
  logPaidProSourceOfTruthEstablishmentAttempt({
    source: "hydratePaidProSourceOfTruth",
    allowed: establishmentGate.allowed,
    reason: establishmentGate.reason,
    hasProEntitlement: establishmentGate.hasProEntitlement,
    hasFreeStarterSession: establishmentGate.hasFreeStarterSession,
    generationId: establishmentGate.generationId,
    agreementGenerationId: args.agreementGenerationId ?? reviewSessionId,
    textLen: text.length,
  });
  if (!establishmentGate.allowed) return null;

  const providedHash = trim(args.hash);
  const byteIdenticalReplay = Boolean(providedHash && providedHash === hashPaidProCorpus(text));
  // Reload clears in-memory generation marks; rematerialize before any freezeCanonical work.
  markPaidReviewSessionPremiumGeneration(reviewSessionId, "hydrate_accepted_paid_pro_snapshot");

  // Hash-verified accepted replay: install SoT bytes only — skip structural rebuild + freeze.
  // establishPaidProSourceOfTruth remains the sole freeze authority; hydrate rematerializes.
  if (byteIdenticalReplay) {
    const record: PaidProSourceOfTruth = {
      text,
      hash: providedHash,
      accepted_at: args.accepted_at ?? Date.now(),
      source: "server_full_draft",
      reviewSessionId: reviewSessionId || undefined,
    };
    const hydrateBefore = getPaidProSourceOfTruth()?.text ?? "";
    replacePaidProSourceOfTruth(record);
    const draftParties = (args.draft?.parties ?? [])
      .map((p) => ({
        name: String((p as { name?: string }).name ?? "").trim(),
        role: "party",
        email: String((p as { email?: string }).email ?? "").trim() || undefined,
        partyAddress: String((p as { partyAddress?: string }).partyAddress ?? "").trim() || undefined,
      }))
      .filter((p) => p.name.length > 0);
    hydrateAuthoritativeAgreementDocument({
      fullCorpusText: record.text,
      authoritativeHash: record.hash,
      canonicalPartyManifest: draftParties,
      agreementMetadata: {
        reviewSessionId: record.reviewSessionId ?? null,
      },
      acceptedAt: record.accepted_at,
    });
    // Rematerialize frozen canonical via preserve-only path so delivery-track CTAs
    // (canChooseProDeliveryTrack) see hasFrozenCanonicalAgreementCorpus — no validation rebuild.
    if (!hasFrozenCanonicalAgreementCorpus()) {
      try {
        const snapshot = buildCanonicalAgreementSnapshot({
          surface: "paid_pro_source_of_truth_hydrate",
          tier: "pro",
          candidates: [{ source: "server_full_document_text", text }],
          minLen: 500,
          reviewSessionId,
          forceAuthoritativePreservation: true,
          skipClauseFamilyPlaceholderIssues: true,
          parties: draftParties,
        });
        freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
      } catch {
        /* SoT already installed; frozen metadata is best-effort on replay */
      }
    }
    tracePaidProCorpusMutation({
      store: "paidProSourceOfTruth",
      caller: "hydratePaidProSourceOfTruth",
      stage: "hydrate_byte_identical_replay",
      surface: args.source ?? "server_full_draft",
      oldText: hydrateBefore,
      newText: record.text,
      sourceBefore: null,
      sourceAfter: record.source,
    });
    return record;
  }

  const hydrateCtx = resolvePaidProHydrateStructuralContext({
    text,
    hash: args.hash,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
  });
  assertPaidProHydrateAuthorityInvariant(hydrateCtx, "paid_pro_source_of_truth_hydrate");

  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_hydrate",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text }],
    minLen: 500,
    reviewSessionId,
    intakeText: args.intakeText ?? null,
    forceAuthoritativePreservation: false,
    parties: hydrateCtx.structuralParties.map((party) => ({
      name: party.partyLegalName,
      role: "party",
      email: party.signerEmail,
      partyAddress: party.partyAddress,
    })),
    skipClauseFamilyPlaceholderIssues: hydrateCtx.replayFromFrozenHash,
    clauseFamilyStructuralContext: {
      parties: hydrateCtx.structuralParties,
      draftPartyCount: hydrateCtx.draftPartyNames.length,
      intakeText: args.intakeText ?? null,
      draftPartyNames: hydrateCtx.draftPartyNames,
      acceptedCorpus: text,
      handoffPartySlots: hydrateCtx.handoffPartySlots,
    },
  });
  const frozen = freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
  const record: PaidProSourceOfTruth = {
    text: frozen?.canonicalText ?? text,
    hash: frozen?.hash ?? (providedHash || hashPaidProCorpus(text)),
    accepted_at: args.accepted_at ?? Date.now(),
    source: "server_full_draft",
    reviewSessionId: frozen?.reviewSessionId ?? reviewSessionId ?? undefined,
    signerManifestHash: frozen?.signerManifestHash,
  };
  const hydrateBefore = getPaidProSourceOfTruth()?.text ?? "";
  replacePaidProSourceOfTruth(record);
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
