/**
 * Paid Pro source of truth.
 *
 * Once a paid Pro server_full_draft is accepted, this is the only agreement body
 * the frontend may display, copy, finalize, or send to signing unless the user
 * explicitly creates a revision.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  applyAcceptedProCorpusSafeDisplay,
} from "./acceptedProCorpusSafeDisplay";
import {
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { clearAcceptedProCorpusSafeDisplayCacheForTests } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";
import { resetPaidProCorpusLifecycleDiffForTests } from "./paidProCorpusLifecycleDiff";
import { validateProMinimumSubstance } from "./paidProConciseServicesQuality";
import {
  hasPaidProPipelineSessionAcceptance,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { logFalseProAuthorityBlocked } from "./paidProRuntimeAuthorityEstablishment";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
  hasFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
  type CanonicalAgreementSnapshotParty,
  type CanonicalAgreementSurface,
} from "./canonicalAgreementSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
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
} from "./paidProDisplayPlainAuthority";
import { paidProSignerExecutionCorpusIsFrozen } from "./paidProFinalHydratedCorpus";
import { logPaidProDriftCorpusCaptureOnce } from "./paidProDriftCorpusCapture";
import { tracePaidProCorpusMutation } from "./paidProMutationTrace";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  isGenericPaidProAcceptanceManifestFallback,
  manifestRecordsForPaidProAcceptance,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { assertPaidProSingleExecutionBlock } from "./paidProExecutionBlockAuthority";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import {
  clearPaidProReviewRenderFusedRepairCache,
} from "./paidProReviewRenderCorpus";
import {
  clearPaidProSignerStagingDisplayCorpus,
} from "./paidProSignerStagingDisplayCorpus";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  detectPaidProOrphanSubsections,
  normalizePaidProOrphanSubsections,
} from "./normalizePaidProOrphanSubsections";
import {
  evaluatePaidProSourceOfTruthEstablishment,
  logPaidProSourceOfTruthEstablishmentAttempt,
} from "./paidProSessionEligibility";

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
  const authorityGuard = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: args.text,
    candidateSource: requestedSource,
    renderSource: requestedSource,
    generationOutcome: args.generationOutcome ?? "ok",
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    reason: "establish_paid_pro_source_of_truth",
  });
  const authorityText = authorityGuard.text;
  logProCorpusSourceMap({
    stage: "server_full_draft_received",
    source: args.source ?? "server_full_draft",
    len: authorityText.length,
    text: authorityText,
    allowedToOverride: false,
    reason: authorityGuard.rejected
      ? "establish_paid_pro_source_of_truth_latch_restore"
      : "establish_paid_pro_source_of_truth",
  });
  const incomingPreparedHash = paidProPipelineAcceptedCorpusHash(authorityText);
  const pipelineAcceptedHash = readPaidProPipelineAcceptedCorpusHash();
  const skipRedundantSafeDisplay =
    Boolean(pipelineAcceptedHash) &&
    Boolean(incomingPreparedHash) &&
    pipelineAcceptedHash === incomingPreparedHash;
  const safe = skipRedundantSafeDisplay
    ? authorityText
    : applyAcceptedProCorpusSafeDisplay(authorityText, {
        draft: args.draft ?? null,
        intakeText: args.intakeText ?? null,
        surface: "establish_paid_pro_source_of_truth",
      }).text;
  const pipelineSessionAccepted =
    hasPaidProPipelineSessionAcceptance({
      text: authorityText,
      source: requestedSource,
    }) ||
    hasPaidProPipelineSessionAcceptance({
      text: trim(args.text),
      source: requestedSource,
    });
  if (pipelineSessionAccepted && safe !== authorityText) {
    markPaidProPipelineValidationPassed({ text: safe, source: requestedSource });
  }
  const minimumSubstance = validateProMinimumSubstance({
    text: safe,
    rawIntake: args.intakeText ?? "",
    draft: args.draft ?? null,
    source: requestedSource,
  });
  const intakeHasConcreteServicesFacts =
    /\b(?:ai|artificial intelligence|workflow|automation)\b/i.test(args.intakeText ?? "") &&
    /\b(?:ai|artificial intelligence|workflow|automation)\b/i.test(args.draft?.purpose ?? "");
  const pipelineAcceptedAfterSubstance =
    pipelineSessionAccepted ||
    hasPaidProPipelineSessionAcceptance({ text: safe, source: requestedSource });
  if (minimumSubstance.applies && !minimumSubstance.ok && intakeHasConcreteServicesFacts) {
    const emptyUnknownSubstanceFailure = minimumSubstance.missingSections.length === 0;
    const advisoryOnly =
      pipelineAcceptedAfterSubstance && emptyUnknownSubstanceFailure;
    if (!advisoryOnly) {
      throw new Error(
        `[pro-minimum-substance-blocked] missingSections=${minimumSubstance.missingSections.join(",") || "unknown"}`,
      );
    }
    logProCorpusSourceMap({
      stage: "client_gates_passed",
      source: requestedSource,
      len: safe.length,
      text: safe,
      allowedToOverride: false,
      reason: `minimum_substance_advisory_after_pipeline_accept;malformedOpening=${minimumSubstance.malformedOpening};missing=${minimumSubstance.missingSections.join(",") || "unknown"}`,
    });
  }
  logProCorpusSourceMap({
    stage: "client_gates_passed",
    source: args.source ?? "server_full_draft",
    len: safe.length,
    text: safe,
    allowedToOverride: false,
    reason: "accepted_pro_corpus_safe_display",
  });
  const postSafeGuard = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: safe,
    candidateSource: requestedSource,
    renderSource: requestedSource,
    generationOutcome: args.generationOutcome ?? "ok",
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    reason: "establish_paid_pro_source_of_truth_post_safe_display",
  });
  let safeForCommit = postSafeGuard.text;
  const acceptanceManifest = manifestRecordsForPaidProAcceptance({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  const skipAcceptanceExecutionSynthesis = isGenericPaidProAcceptanceManifestFallback(
    acceptanceManifest,
  );
  if (!skipAcceptanceExecutionSynthesis) {
    const exec = ensurePaidProAcceptanceExecutionBlockInvariant(safeForCommit, acceptanceManifest);
    safeForCommit = exec.text;
    assertPaidProSingleExecutionBlock(safeForCommit, "establish_paid_pro_source_of_truth_pre_freeze");
  }
  const partyNameList = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const roleLabels = (args.draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  if (intakeHasFullLegalEntityParties(args.intakeText ?? null, partyNameList)) {
    const identityRecords = resolveCanonicalPartyIdentitiesFromIntake(
      args.intakeText ?? "",
      partyNameList,
      roleLabels.length >= 2 ? roleLabels : undefined,
    );
    if (identityRecords.length >= 2) {
      safeForCommit = ensurePaidProServicesAgreementOpening(
        safeForCommit,
        identityRecords,
        args.intakeText ?? null,
      ).text;
    }
  }
  const orphanDetect = detectPaidProOrphanSubsections(safeForCommit);
  if (orphanDetect.orphanSectionsFound > 0) {
    const orphanRepair = normalizePaidProOrphanSubsections(safeForCommit, {
      source: "establish_paid_pro_source_of_truth_pre_freeze",
    });
    safeForCommit = orphanRepair.text;
    logProCorpusSourceMap({
      stage: "pre_freeze_orphan_subsection_repair",
      source: args.source ?? "server_full_draft",
      len: safeForCommit.length,
      text: safeForCommit,
      allowedToOverride: false,
      reason: `orphan_sections=${orphanRepair.sectionNumbers.join(",")}`,
    });
  }
  const parties: CanonicalAgreementSnapshotParty[] = (args.draft?.parties ?? [])
    .map((p) => ({
      name: String(p?.name ?? "").trim(),
      role: p?.role ? String(p.role).trim() : null,
      email: p?.email ? String(p.email).trim() : null,
      partyAddress: (p as { partyAddress?: string | null })?.partyAddress
        ? String((p as { partyAddress?: string | null }).partyAddress).trim()
        : null,
    }))
    .filter((p) => p.name);
  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_establish",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: safeForCommit }],
    intakeText: args.intakeText ?? null,
    parties,
    signerState: { complete: false, signerCount: Math.max(2, parties.length) },
    minLen: 500,
    reviewSessionId: args.reviewSessionId,
  });
  const frozen = freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
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
      signerState: { complete: false, signerCount: Math.max(2, parties.length) },
      minLen: 500,
      reviewSessionId: args.reviewSessionId,
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
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-source-of-truth]", {
      phase: "established",
      accepted_len: record.text.length,
      hash: record.hash,
      source: record.source,
    });
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
    canonicalHash: sotForTelemetry?.hash ?? hash,
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
