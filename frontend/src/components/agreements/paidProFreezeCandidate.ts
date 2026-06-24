/**
 * Canonical Pro freeze candidate — one normalized corpus path for acceptance and SoT freeze.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  repairAgreementTemplatePlaceholders,
  repairPaidProFreezePlaceholderAuthority,
} from "./agreementTemplatePlaceholderSafety";
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  isGenericPaidProAcceptanceManifestFallback,
  manifestRecordsForPaidProAcceptance,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { assertPaidProSingleExecutionBlock } from "./paidProExecutionBlockAuthority";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { assertClauseFamilyStructuralIntegrityForFreeze } from "./clauseFamilyStructuralIntegrity";
import { assertPaidProDocumentBoundaryAuthorityForFreeze, applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import {
  assertPaidProSectionStructureCompletenessForFreeze,
  applyPaidProSectionStructureCompletenessAuthority,
} from "./paidProSectionStructureCompletenessAuthority";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import {
  detectPaidProOrphanSubsections,
  normalizePaidProOrphanSubsections,
} from "./normalizePaidProOrphanSubsections";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { buildPartyEntries, frozenManifestRecitalNeedsRewrite, normalizeOpeningRecital } from "./paidProAgreementPolish";
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import {
  readPremiumRecipientHandoff,
  resolveHandoffPartySlotCount,
} from "./premiumPartyNamesHandoff";
import {
  hasPaidProPipelineSessionAcceptance,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
  markPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { logProCorpusSourceMap } from "./proCorpusSourcePath";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderCorpus";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  assertProfessionalCorpusCleanForFreeze,
  repairProfessionalCorpusContamination,
} from "./paidProProfessionalCorpusContamination";

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export type PreparePaidProFreezeCandidateArgs = {
  text: string;
  source?: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  agreementGenerationId?: string | null;
  generationOutcome?: string | null;
  reviewSessionId?: string | null;
  surface?: string;
};

export type PaidProFreezeCandidatePrepResult = {
  text: string;
  hash: string;
  reviewParties: readonly PaidProSignerMetadataParty[];
  parties: CanonicalAgreementSnapshotParty[];
  repairs: string[];
};

export type PaidProFreezeCandidateGateResult = {
  ok: boolean;
  text: string;
  hash: string;
  rejectReason: string | null;
  reviewParties: readonly PaidProSignerMetadataParty[];
  parties: CanonicalAgreementSnapshotParty[];
};

export function logPaidProFreezeCandidateDecision(payload: {
  accepted: boolean;
  source: string;
  candidateHash: string;
  acceptanceHash?: string | null;
  hashesMatch?: boolean;
  rejectReason?: string | null;
  candidateLen: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-freeze-candidate-decision]", payload);
}

/** Normalize server/prepared text through the same pre-freeze transform chain as SoT establishment. */
export function preparePaidProFreezeCandidateText(
  args: PreparePaidProFreezeCandidateArgs,
): PaidProFreezeCandidatePrepResult {
  const requestedSource = (args.source ?? "server_full_draft").trim();
  const surface = args.surface ?? "paid_pro_freeze_candidate";
  const repairs: string[] = [];

  const authorityGuard = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: args.text,
    candidateSource: requestedSource,
    renderSource: requestedSource,
    generationOutcome: args.generationOutcome ?? "ok",
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    reason: "prepare_paid_pro_freeze_candidate",
  });
  const authorityText = authorityGuard.text;
  const authorityTrimmed = trim(authorityText);
  const authorityStableHash = paidProPipelineAcceptedCorpusHash(authorityTrimmed);
  const pipelineAcceptedHash = readPaidProPipelineAcceptedCorpusHash();
  if (
    authorityStableHash &&
    pipelineAcceptedHash &&
    pipelineAcceptedHash === authorityStableHash &&
    authorityTrimmed.length >= 4000 &&
    hasPaidProPipelineSessionAcceptance({
      text: authorityTrimmed,
      source: requestedSource,
    })
  ) {
    const reviewParties = resolvePartiesForReviewRender({
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
    });
    const parties: CanonicalAgreementSnapshotParty[] = reviewParties
      .map((p) => ({
        name: p.partyLegalName.trim(),
        role: null,
        email: p.signerEmail?.trim() || null,
        partyAddress: p.partyAddress?.trim() || null,
      }))
      .filter((p) => p.name.length >= 2);
    return {
      text: authorityTrimmed,
      hash: hashPaidProCorpus(authorityTrimmed),
      reviewParties,
      parties,
      repairs: ["freeze_prep_skipped_pipeline_stable_corpus"],
    };
  }

  const incomingPreparedHash = paidProPipelineAcceptedCorpusHash(authorityText);
  const skipRedundantSafeDisplay =
    Boolean(pipelineAcceptedHash) &&
    Boolean(incomingPreparedHash) &&
    pipelineAcceptedHash === incomingPreparedHash;

  let safe = skipRedundantSafeDisplay
    ? authorityText
    : applyAcceptedProCorpusSafeDisplay(authorityText, {
        draft: args.draft ?? null,
        intakeText: args.intakeText ?? null,
        surface,
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

  const postSafeGuard = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: safe,
    candidateSource: requestedSource,
    renderSource: requestedSource,
    generationOutcome: args.generationOutcome ?? "ok",
    agreementGenerationId: args.agreementGenerationId ?? args.reviewSessionId ?? null,
    reason: "prepare_paid_pro_freeze_candidate_post_safe_display",
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
    repairs.push(...exec.repairs);
    assertPaidProSingleExecutionBlock(safeForCommit, `${surface}_pre_freeze`);
  }

  const partyNameList = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const roleLabels = (args.draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  const acceptanceManifestForOpening = manifestRecordsForPaidProAcceptance({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (acceptanceManifestForOpening.length >= 3) {
    const manifestNames = acceptanceManifestForOpening.map((r) => r.fullLegalName);
    const recital = normalizeOpeningRecital(
      safeForCommit,
      buildPartyEntries(manifestNames),
      "high",
      { forceRewrite: frozenManifestRecitalNeedsRewrite(safeForCommit, manifestNames) },
    );
    safeForCommit = recital.text;
  } else if (intakeHasFullLegalEntityParties(args.intakeText ?? null, partyNameList)) {
    const identityRecords = resolveCanonicalPartyIdentitiesFromIntake(
      args.intakeText ?? "",
      partyNameList,
      roleLabels.length >= 2 ? roleLabels : undefined,
    );
    if (identityRecords.length >= 2) {
      const opening = ensurePaidProServicesAgreementOpening(
        safeForCommit,
        identityRecords,
        args.intakeText ?? null,
      );
      safeForCommit = opening.text;
      if (opening.repairs?.length) repairs.push(...opening.repairs);
    }
  }

  const orphanDetect = detectPaidProOrphanSubsections(safeForCommit);
  if (orphanDetect.orphanSectionsFound > 0) {
    const orphanRepair = normalizePaidProOrphanSubsections(safeForCommit, { source: surface });
    safeForCommit = orphanRepair.text;
    repairs.push(`orphan_sections=${orphanRepair.sectionNumbers.join(",")}`);
  }

  const orphanSectionRepair = repairPaidProOrphanSectionNumbers(safeForCommit);
  if (orphanSectionRepair.repairs.length > 0) {
    safeForCommit = orphanSectionRepair.text;
    repairs.push(...orphanSectionRepair.repairs);
  }

  const reviewParties = resolvePartiesForReviewRender({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  const parties: CanonicalAgreementSnapshotParty[] = reviewParties
    .map((p) => ({
      name: p.partyLegalName.trim(),
      role: null,
      email: p.signerEmail?.trim() || null,
      partyAddress: p.partyAddress?.trim() || null,
    }))
    .filter((p) => p.name.length >= 2);
  const partyNames = parties.map((p) => p.name);

  for (let pass = 0; pass < 2; pass++) {
    const placeholderRepair = repairAgreementTemplatePlaceholders(safeForCommit, {
      intakeRaw: args.intakeText ?? "",
      partyNames,
    });
    safeForCommit = placeholderRepair.text;
    repairs.push(...placeholderRepair.repaired);
    if (placeholderRepair.repaired.length === 0) break;
  }

  const freezeAuthorityRepair = repairPaidProFreezePlaceholderAuthority(safeForCommit, {
    intakeRaw: args.intakeText ?? "",
    partyNames,
  });
  if (freezeAuthorityRepair.repaired.length > 0) {
    safeForCommit = freezeAuthorityRepair.text;
    repairs.push(...freezeAuthorityRepair.repaired);
  }

  const canonicalStructure = applyPaidProCanonicalDocumentStructureAuthority(safeForCommit, {
    source: surface,
    phase: "pre_freeze",
  });
  if (canonicalStructure.repairs.length > 0) {
    safeForCommit = canonicalStructure.text;
    repairs.push(...canonicalStructure.repairs.slice(0, 8));
  }

  const contaminationRepair = repairProfessionalCorpusContamination(safeForCommit, {
    partyNames: partyNames,
    partyCount: parties.length,
    signerNames: reviewParties.map((p) => p.signerName),
  });
  if (contaminationRepair.repairs.length > 0) {
    safeForCommit = contaminationRepair.text;
    repairs.push(...contaminationRepair.repairs);
  }

  return {
    text: safeForCommit,
    hash: hashPaidProCorpus(safeForCommit),
    reviewParties,
    parties,
    repairs,
  };
}

/** Run freeze-hard gates on a prepared candidate (throws on failure). */
export function assertPaidProFreezeCandidateGates(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
): string {
  const surface = args.surface ?? "paid_pro_freeze_candidate";
  const inputTrimmed = trim(args.text);
  const inputPipelineHash = paidProPipelineAcceptedCorpusHash(inputTrimmed);
  const pipelineHash = readPaidProPipelineAcceptedCorpusHash();
  if (
    inputPipelineHash &&
    pipelineHash &&
    pipelineHash === inputPipelineHash &&
    hasPaidProPipelineSessionAcceptance({
      text: inputTrimmed,
      source: args.source ?? "server_full_draft",
    })
  ) {
    return inputTrimmed;
  }
  const prepPipelineHash = paidProPipelineAcceptedCorpusHash(prep.text);
  if (
    prep.repairs.includes("freeze_prep_skipped_pipeline_stable_corpus") &&
    prepPipelineHash &&
    pipelineHash &&
    pipelineHash === prepPipelineHash &&
    hasPaidProPipelineSessionAcceptance({
      text: prep.text,
      source: args.source ?? "server_full_draft",
    })
  ) {
    return prep.text;
  }
  let safeForCommit = prep.text;

  safeForCommit = assertPaidProDocumentBoundaryAuthorityForFreeze(safeForCommit, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: `${surface}_pre_freeze`,
    parties: prep.reviewParties,
    draftPartyCount: args.draft?.parties?.length ?? 0,
    handoffPartySlots: (() => {
      const handoff = readPremiumRecipientHandoff();
      if (!handoff) return prep.reviewParties.length;
      return resolveHandoffPartySlotCount(handoff, prep.reviewParties.length);
    })(),
  });

  const postBoundaryStructure = applyPaidProSectionStructureCompletenessAuthority(safeForCommit, {
    source: `${surface}_post_boundary`,
    phase: "pre_freeze",
    blockOnFatal: false,
  });
  if (postBoundaryStructure.repairs.length > 0) {
    safeForCommit = postBoundaryStructure.text;
  }

  const preFreezeExecutionManifest = resolveAcceptanceManifestRecordsForExecution({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (
    preFreezeExecutionManifest.length >= 3 &&
    !isGenericPaidProAcceptanceManifestFallback(preFreezeExecutionManifest)
  ) {
    const preFreezeExecution = ensurePaidProAcceptanceExecutionBlockInvariant(
      safeForCommit,
      preFreezeExecutionManifest,
    );
    safeForCommit = preFreezeExecution.text;
    assertPaidProSingleExecutionBlock(
      safeForCommit,
      `${surface}_pre_freeze_execution`,
      { expectedParties: preFreezeExecutionManifest.length },
    );
  }

  if (containsUnresolvedRenderTokens(safeForCommit)) {
    throw new Error(
      "[paid-pro-sot-freeze-blocked] unresolved_render_tokens_after_notice_contact_authority",
    );
  }

  safeForCommit = assertPaidProSectionStructureCompletenessForFreeze(
    safeForCommit,
    `${surface}_pre_freeze`,
  );

  safeForCommit = assertProfessionalCorpusCleanForFreeze(safeForCommit, {
    partyNames: prep.parties.map((p) => p.name),
    partyCount: prep.parties.length,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
    signerNames: prep.reviewParties.map((p) => p.signerName),
    surface: `${surface}_pre_notice_finalize`,
  });

  const noticeFinalize = applyPaidProNoticeContactAuthority(safeForCommit, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: `${surface}_freeze_finalize_notices`,
    blockOnUnresolved: true,
  });
  safeForCommit = noticeFinalize.text;

  const finalizeBoundary = applyPaidProDocumentBoundaryAuthority(safeForCommit, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: `${surface}_freeze_finalize_boundary`,
    parties: prep.reviewParties,
    draftPartyCount: args.draft?.parties?.length ?? 0,
    handoffPartySlots: (() => {
      const handoff = readPremiumRecipientHandoff();
      if (!handoff) return prep.reviewParties.length;
      return resolveHandoffPartySlotCount(handoff, prep.reviewParties.length);
    })(),
    blockOnViolation: false,
    blockOnUnresolved: true,
  });
  safeForCommit = finalizeBoundary.text;

  assertClauseFamilyStructuralIntegrityForFreeze(safeForCommit, {
    parties: prep.reviewParties,
    surface: `${surface}_freeze_finalize`,
    phase: "post_acceptance",
    draftPartyCount: args.draft?.parties?.length ?? 0,
    handoffPartySlots: (() => {
      const handoff = readPremiumRecipientHandoff();
      if (!handoff) return prep.reviewParties.length;
      return resolveHandoffPartySlotCount(handoff, prep.reviewParties.length);
    })(),
  });

  return safeForCommit;
}

/** Non-throwing gate evaluation for acceptance / pipeline. */
export function evaluatePaidProFreezeCandidateGates(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
): PaidProFreezeCandidateGateResult {
  try {
    const text = assertPaidProFreezeCandidateGates(prep, args);
    markPaidProPipelineValidationPassed({
      text,
      source: args.source ?? "server_full_draft",
    });
    markPaidProPipelineAcceptedCorpusHash(text);
    return {
      ok: true,
      text,
      hash: hashPaidProCorpus(text),
      rejectReason: null,
      reviewParties: prep.reviewParties,
      parties: prep.parties,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const rejectReason = extractPaidProFreezeRejectReason(message);
    return {
      ok: false,
      text: prep.text,
      hash: prep.hash,
      rejectReason,
      reviewParties: prep.reviewParties,
      parties: prep.parties,
    };
  }
}

function extractPaidProFreezeRejectReason(message: string): string {
  if (message.includes("missing_notices_heading")) return "missing_notices_heading";
  if (message.includes("section_structure_synthetic_malformed_headings")) {
    return "section_structure_synthetic_malformed_headings";
  }
  if (message.includes("section_structure_completeness_unresolved")) {
    return "section_structure_completeness_unresolved";
  }
  if (message.includes("[paid-pro-clause-family-structural-blocked]")) {
    const codes = message.match(/codes=([^\\]]+)/)?.[1];
    return codes?.split(",")[0] ?? "clause_family_structural";
  }
  if (message.includes("[paid-pro-document-boundary-blocked]")) {
    return "document_boundary_blocked";
  }
  if (message.includes("unresolved_render_tokens")) return "unresolved_render_tokens";
  if (message.includes("[paid-pro-professional-corpus-contamination-blocked]")) {
    const codes = message.match(/blocked\]\s*(.+)/)?.[1];
    return codes?.split(",")[0] ?? "professional_corpus_contamination";
  }
  if (message.includes("[paid-pro-sot-freeze-blocked]")) {
    return message.replace(/^\[paid-pro-sot-freeze-blocked\]\s*/i, "").slice(0, 120);
  }
  return message.slice(0, 120) || "freeze_candidate_rejected";
}

/** Full prepare + gate — canonical acceptance / SoT freeze compatibility check. */
export function buildPaidProFreezeCandidate(
  args: PreparePaidProFreezeCandidateArgs,
): PaidProFreezeCandidateGateResult {
  const prep = preparePaidProFreezeCandidateText(args);
  return evaluatePaidProFreezeCandidateGates(prep, args);
}

/** Preview whether deterministic recovery can pass freeze gates (no SoT commit). */
export function previewRecoverPaidProFreezeCandidate(
  args: {
    draft: ParsedDraftShape | null;
    intakeText: string;
    surface?: string;
  },
): PaidProFreezeCandidateGateResult {
  const draft =
    args.draft ??
    ({
      title: "Agreement",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    } as ParsedDraftShape);

  const built = buildPaidProStructuralRecoveryBody({
    intakeText: args.intakeText,
    draft,
  });
  if (!built.ok) {
    return {
      ok: false,
      text: "",
      hash: "",
      rejectReason: `deterministic_fallback_failed:${built.reason ?? "recovery_build_failed"}`,
      reviewParties: [],
      parties: [],
    };
  }

  const prep = preparePaidProServerDocumentForAcceptance(
    built.body,
    draft,
    args.intakeText,
    { surface: args.surface ?? "paid_pro_freeze_candidate_recovery_preview" },
  );
  return buildPaidProFreezeCandidate({
    text: prep.text,
    draft,
    intakeText: args.intakeText,
    source: "server_full_draft_retry",
    surface: args.surface ?? "paid_pro_freeze_candidate_recovery_preview",
  });
}

export function clearPartialPaidProAuthoritativeState(): void {
  logProCorpusSourceMap({
    stage: "client_gates_passed",
    source: "paid_pro_freeze_candidate",
    len: 0,
    text: "",
    allowedToOverride: false,
    reason: "partial_authoritative_state_cleared_sot_freeze_failed",
  });
}
