/**
 * Canonical Pro freeze candidate — one normalized corpus path for acceptance and SoT freeze.
 */

import { isCreatorDashboardSignerSetupResumeActive } from "../../launch/creatorDashboardReviewLinkRouting";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { clearAcceptedProCorpusSafeDisplayCache } from "./paidProAcceptedCorpusSafeDisplayCache";
import {
  repairAgreementTemplatePlaceholders,
  repairPaidProFreezePlaceholderAuthority,
} from "./agreementTemplatePlaceholderSafety";
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  executionBlockMatchesManifestRecords,
  executionHeadingsContainIntakeInstructionLeakage,
  isGenericPaidProAcceptanceManifestFallback,
  manifestRecordsForPaidProAcceptance,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { appendProExecutionBlockIfMissing } from "./proExecutionBlockAppend";
import { assertPaidProSingleExecutionBlock } from "./paidProExecutionBlockAuthority";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { assertClauseFamilyStructuralIntegrityForFreeze } from "./clauseFamilyStructuralIntegrity";
import { assertPaidProDocumentBoundaryAuthorityForFreeze, applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import {
  applyPaidProNoticeContactAuthority,
  finalizePaidProCanonicalNoticeAuthorityForFreeze,
  resolvePaidProNoticeAuthorityPartiesForFreeze,
} from "./paidProNoticeContactAuthority";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import { applyPaidProSectionHeadingTitleAuthority } from "./paidProSectionHeadingTitleAuthority";
import { diagnosePaidProCorpusDuplication, repairPaidProCorpusDuplication } from "./paidProCorpusDuplicationAuthority";
import {
  ensureCanonicalNoticesSectionHeadingForFreeze,
  repairDuplicateOperativeNoticeStanzas,
  sealPaidProNoticesExecutionBoundaryInCorpus,
  ensureOperativeNoticeStanzaEntityLinesAtFreeze,
  ensureOperativeNoticeStanzaCountAuthorityAtFreeze,
  trimOperativeNoticeStanzasToPartyCount,
} from "./paidProPartyNoticeDetails";
import {
  assertPaidProSectionStructureCompletenessForFreeze,
  applyPaidProSectionStructureCompletenessAuthority,
} from "./paidProSectionStructureCompletenessAuthority";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import {
  assertPaidProReviewedDocumentIntegrity,
  preparePaidProImmutableReviewedDocument,
} from "./paidProReviewedDocumentIntegrity";
import {
  detectPaidProOrphanSubsections,
  normalizePaidProOrphanSubsections,
} from "./normalizePaidProOrphanSubsections";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { buildPartyEntriesFromManifestRecords, frozenManifestRecitalNeedsRewrite, normalizeOpeningRecital } from "./paidProAgreementPolish";
import {
  detectPaidProMalformedMultiPartyOpening,
  ensurePaidProMultiPartyAgreementOpening,
  ensurePaidProServicesAgreementOpening,
} from "./paidProOpeningRecitalGuard";
import { repairAdjacentDuplicatePartyNamesInOpening, repairDuplicateAgreementOpening } from "./canonicalPartyIdentityResolver";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import {
  preserveFullLegalPartyNamesInOpeningAndSignatures,
  isAuthoritativeLegalEntityName,
  isPartyMetadataFieldLabelValue,
} from "./paidProPartyNamePreserve";
import {
  resolveAuthoritativeIntakePartyNames,
  resolveDeclaredExplicitPartyCount,
  repairDraftPartiesFromIntakeAuthority,
} from "./partySlotIdentityNormalize";
import {
  readPremiumRecipientHandoff,
  resolveHandoffPartySlotCount,
} from "./premiumPartyNamesHandoff";
import {
  hasPaidProPipelineSessionAcceptance,
  hasPaidProPipelineValidationForCorpus,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { logProCorpusSourceMap } from "./proCorpusSourcePath";
import { tracePaidProAcceptancePipelineStage } from "./paidProAcceptancePipelineTrace";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderCorpus";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
} from "./paidProAcceptedCorpusPartyRoles";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  assertBrandLicensingFrozenCorpusAuthorityForFreeze,
  applyBrandLicensingFrozenCorpusAuthority,
} from "./paidProBrandLicensingFreezeAuthority";
import { repairBrandLicensingRoleFidelityInCorpus } from "./paidProBrandLicensingRoleFidelityRepair";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN, PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  assertProfessionalCorpusCleanForFreeze,
  repairProfessionalCorpusContamination,
} from "./paidProProfessionalCorpusContamination";
import {
  assertNoNumberedOperativeSectionAfterWitness,
  relocatePostWitnessNumberedPaddingBeforeWitness,
  stripNumberedOperativeSectionsAfterExecution,
} from "./paidProSupplementalProvisionsFillerGate";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

/**
 * Align CLIENT / SERVICE PROVIDER entity assignment with opening recital roles before freeze.
 * Must run for all corpora (including 2-party services and pipeline-stable short-circuits),
 * not only multiparty brand-licensing paths.
 */
function reconcileExecutionRolesBeforeFreezeCommit(text: string): string {
  const body = trim(text);
  if (!body || !detectExecutionBlockRoleInversion(body)) return body;
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return body;
  const tail = body.slice(witnessIdx);
  // Only repair classic CLIENT / SERVICE PROVIDER role-heading blocks — never collapse
  // multiparty entity-heading or PARTY N execution tails.
  if (!/^\s*CLIENT\s*:/im.test(tail) || !/^\s*SERVICE\s+PROVIDER\s*:/im.test(tail)) return body;
  if (/^\s*PARTY\s+\d+\s*:/im.test(tail)) return body;

  const identities = buildCorpusRoleIdentitiesForExecutionReconcile(body);
  const client = identities.find((i) => i.blockHeading.trim().toUpperCase() === "CLIENT");
  const provider = identities.find(
    (i) => i.blockHeading.trim().toUpperCase() === "SERVICE PROVIDER",
  );
  if (!client?.partyDisplayName?.trim() || !provider?.partyDisplayName?.trim()) return body;

  const reconciled = reconcileExecutionBlockToRoleIdentities(body, [client, provider]);
  return reconciled.repairs > 0 ? reconciled.text : body;
}

function isSubstantiveBrandLicensingCorpus(
  text: string,
  intakeText: string | null | undefined,
): boolean {
  return (
    trim(text).length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN &&
    intakeDescribesBrandLicensingDistributionManufacturingStack(trim(intakeText))
  );
}

function preserveSubstantiveBrandLicensingCorpusLength(
  entryText: string,
  mutatedText: string,
  intakeText: string | null | undefined,
): string {
  const entry = trim(entryText);
  const out = trim(mutatedText);
  if (!isSubstantiveBrandLicensingCorpus(entry, intakeText)) return out;
  const floor = Math.max(
    SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
    Math.floor(entry.length * 0.85),
  );
  return out.length >= floor ? out : entry;
}

function isSubstantiveServerFullDraftSource(source: string | null | undefined): boolean {
  const s = trim(source);
  return (
    s === "server_full_draft" ||
    s === "server_full_draft_retry" ||
    s === "server_full_draft_degraded" ||
    s === "snapshot_server_full_draft"
  );
}

function preserveSubstantiveServerFullDraftCorpusLength(
  entryText: string,
  mutatedText: string,
  source: string | null | undefined,
): string {
  const entry = trim(entryText);
  const out = trim(mutatedText);
  if (!isSubstantiveServerFullDraftSource(source)) return out;
  if (entry.length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) return out;
  const floor = Math.max(
    PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
    Math.floor(entry.length * 0.85),
  );
  return out.length >= floor ? out : entry;
}

function finalizePreparedFreezeCandidateText(
  entryText: string,
  mutatedText: string,
  args: { intakeText?: string | null; source?: string | null },
): string {
  const brandPreserved = preserveSubstantiveBrandLicensingCorpusLength(
    entryText,
    mutatedText,
    args.intakeText ?? null,
  );
  const lengthPreserved = preserveSubstantiveServerFullDraftCorpusLength(
    entryText,
    brandPreserved,
    args.source ?? null,
  );
  // Length floor may restore the entry corpus; always re-align signature roles last.
  return reconcileExecutionRolesBeforeFreezeCommit(lengthPreserved);
}

function finalizeSubstantiveBrandLicensingCorpusAfterWitness(
  entryText: string,
  mutatedText: string,
  intakeText: string | null | undefined,
): string {
  const entry = trim(entryText);
  let working = preserveSubstantiveBrandLicensingCorpusLength(entry, mutatedText, intakeText);
  const relocated = relocatePostWitnessNumberedPaddingBeforeWitness(working);
  if (relocated.relocatedCount > 0) {
    working = preserveSubstantiveBrandLicensingCorpusLength(entry, relocated.text, intakeText);
  }
  const postWitness = stripNumberedOperativeSectionsAfterExecution(working);
  if (postWitness.strippedCount > 0) {
    working = preserveSubstantiveBrandLicensingCorpusLength(entry, postWitness.text, intakeText);
  }
  return working;
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

/** Structural freeze prep only — not pipeline acceptance until validatePaidProOutput passes. */
export function logPaidProFreezeCandidatePrep(payload: {
  prepOk: boolean;
  source: string;
  preparedFreezeCandidateHash: string;
  validationInputHash?: string | null;
  validationInputMatchesPreparedFreeze?: boolean;
  rejectReason?: string | null;
  candidateLen: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-freeze-candidate-prep]", payload);
}

/** Final freeze acceptance — only when professional validation also passed (no silent contradiction). */
export function logPaidProFreezeCandidateDecision(payload: {
  accepted: boolean;
  source: string;
  preparedFreezeCandidateHash: string;
  validationInputHash?: string | null;
  validationInputMatchesPreparedFreeze?: boolean;
  rejectReason?: string | null;
  candidateLen: number;
  freezePrepWasOk?: boolean;
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
  const inputTrimmed = trim(args.text);
  const inputPipelineHash = paidProPipelineAcceptedCorpusHash(inputTrimmed);
  const pipelineHashEarly = readPaidProPipelineAcceptedCorpusHash();
  if (
    inputTrimmed.length >= 4000 &&
    inputPipelineHash &&
    pipelineHashEarly &&
    inputPipelineHash === pipelineHashEarly &&
    hasPaidProPipelineValidationForCorpus({
      text: inputTrimmed,
      source: requestedSource,
    })
  ) {
    const integrity = preparePaidProImmutableReviewedDocument(inputTrimmed);
    if (integrity.ok) {
      const reconciled = reconcileExecutionRolesBeforeFreezeCommit(integrity.text);
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
        text: reconciled,
        hash: hashPaidProCorpus(reconciled),
        reviewParties,
        parties,
        repairs: [
          "freeze_prep_skipped_pipeline_validated_corpus",
          ...integrity.repairs.map((r) => `reviewed_doc_integrity:${r}`),
          ...(reconciled !== integrity.text
            ? ["freeze_prep:reconcile_execution_block_roles"]
            : []),
        ],
      };
    }
    // Integrity failed — do not skip into a defective SoT; run full freeze prep.
  }

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
    const integrity = preparePaidProImmutableReviewedDocument(authorityTrimmed);
    if (integrity.ok) {
      const reconciled = reconcileExecutionRolesBeforeFreezeCommit(integrity.text);
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
        text: reconciled,
        hash: hashPaidProCorpus(reconciled),
        reviewParties,
        parties,
        repairs: [
          "freeze_prep_skipped_pipeline_stable_corpus",
          ...integrity.repairs.map((r) => `reviewed_doc_integrity:${r}`),
          ...(reconciled !== integrity.text
            ? ["freeze_prep:reconcile_execution_block_roles"]
            : []),
        ],
      };
    }
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
  if (
    !skipAcceptanceExecutionSynthesis &&
    !isSubstantiveBrandLicensingCorpus(authorityTrimmed, args.intakeText)
  ) {
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
  if (
    acceptanceManifestForOpening.length >= 3 &&
    !intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText ?? "")
  ) {
    const adjacentDup = repairAdjacentDuplicatePartyNamesInOpening(
      safeForCommit,
      acceptanceManifestForOpening,
    );
    safeForCommit = adjacentDup.text;
    repairs.push(...adjacentDup.repairs);

    const dupOpen = repairDuplicateAgreementOpening(safeForCommit, acceptanceManifestForOpening);
    safeForCommit = dupOpen.text;
    repairs.push(...dupOpen.repairs);

    const multiOpening = ensurePaidProMultiPartyAgreementOpening(
      safeForCommit,
      acceptanceManifestForOpening,
      args.intakeText ?? null,
    );
    safeForCommit = multiOpening.text;
    repairs.push(...multiOpening.repairs);

    const partyEntries = buildPartyEntriesFromManifestRecords(acceptanceManifestForOpening);
    const manifestNames = acceptanceManifestForOpening.map((r) => r.fullLegalName);
    const needsRecitalRewrite =
      detectPaidProMalformedMultiPartyOpening(safeForCommit, acceptanceManifestForOpening) ||
      frozenManifestRecitalNeedsRewrite(safeForCommit, manifestNames);
    const recital = normalizeOpeningRecital(safeForCommit, partyEntries, "high", {
      forceRewrite: needsRecitalRewrite,
    });
    safeForCommit = recital.text;
    if (recital.log.applied) repairs.push("opening:normalize_multiparty_recital");
  } else if (
    intakeHasFullLegalEntityParties(args.intakeText ?? null, partyNameList) &&
    !intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText ?? "")
  ) {
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
  if (orphanDetect.orphanSectionsFound > 0 && !isSubstantiveBrandLicensingCorpus(authorityTrimmed, args.intakeText)) {
    const orphanRepair = normalizePaidProOrphanSubsections(safeForCommit, { source: surface });
    safeForCommit = orphanRepair.text;
    repairs.push(`orphan_sections=${orphanRepair.sectionNumbers.join(",")}`);
  }

  if (!isSubstantiveBrandLicensingCorpus(authorityTrimmed, args.intakeText)) {
    const orphanSectionRepair = repairPaidProOrphanSectionNumbers(safeForCommit);
    if (orphanSectionRepair.repairs.length > 0) {
      safeForCommit = orphanSectionRepair.text;
      repairs.push(...orphanSectionRepair.repairs);
    }
  }

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText ?? "") &&
    !isSubstantiveBrandLicensingCorpus(authorityTrimmed, args.intakeText)
  ) {
    const brandAuthority = applyBrandLicensingFrozenCorpusAuthority(
      safeForCommit,
      args.draft ?? null,
      args.intakeText ?? null,
    );
    if (brandAuthority.text !== safeForCommit) {
      safeForCommit = brandAuthority.text;
      repairs.push(...brandAuthority.repairs);
    }
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

  const headingAfterCanonical = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (headingAfterCanonical.repairs.length > 0) {
    safeForCommit = headingAfterCanonical.text;
    repairs.push(...headingAfterCanonical.repairs.map((r) => `section_heading_title:${r}`));
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

  if (parties.length >= 2) {
    const noticePrep = applyPaidProNoticeContactAuthority(safeForCommit, {
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
      surface: `${surface}_prep_notice`,
      blockOnUnresolved: false,
    });
    if (noticePrep.repairs.length > 0) {
      safeForCommit = noticePrep.text;
      repairs.push(...noticePrep.repairs.slice(0, 12));
    }
  }

  if (partyNames.length >= 2) {
    const preservedLegal = preserveFullLegalPartyNamesInOpeningAndSignatures(
      safeForCommit,
      partyNames,
      args.intakeText ?? null,
    );
    if (preservedLegal !== safeForCommit) {
      safeForCommit = preservedLegal;
      repairs.push("party_identity:preserve_opening_notice_signature_legal_names");
    }
  }

  const dupDiagPrep = diagnosePaidProCorpusDuplication(safeForCommit);
  if (
    dupDiagPrep.duplicateMiscellaneousSections >= 2 ||
    dupDiagPrep.duplicateSignaturesFollowMarkers >= 2 ||
    dupDiagPrep.duplicateOpeningRecitals >= 2
  ) {
    const corpusDuplication = repairPaidProCorpusDuplication(safeForCommit);
    if (corpusDuplication.repairs.length > 0) {
      safeForCommit = corpusDuplication.text;
      repairs.push(...corpusDuplication.repairs.map((r) => `corpus_duplication:${r}`));
    }
  }

  const reviewedIntegrity = preparePaidProImmutableReviewedDocument(safeForCommit);
  safeForCommit = reconcileExecutionRolesBeforeFreezeCommit(reviewedIntegrity.text);
  if (reviewedIntegrity.repairs.length > 0) {
    repairs.push(...reviewedIntegrity.repairs.map((r) => `reviewed_doc_integrity:${r}`));
  }
  if (safeForCommit !== reviewedIntegrity.text) {
    repairs.push("freeze_prep:reconcile_execution_block_roles");
  }

  const finalizedText = finalizePreparedFreezeCandidateText(authorityTrimmed, safeForCommit, {
    intakeText: args.intakeText ?? null,
    source: requestedSource,
  });
  return {
    text: finalizedText,
    hash: hashPaidProCorpus(finalizedText),
    reviewParties,
    parties,
    repairs,
  };
}

/**
 * TEST536 — authoritative intake-manifest party count. Explicit declarations ("four parties")
 * are authoritative; otherwise a confident multi-party (3+) set of extracted legal entities.
 * Returns 0 when the intake is not a confident multi-party manifest (2-party flows skip the gate).
 */
export function resolveAuthoritativeIntakeManifestCount(intakeText: string | null | undefined): number {
  const intake = trim(intakeText);
  if (!intake) return 0;
  const declared = resolveDeclaredExplicitPartyCount(intake);
  if (declared != null && declared >= 3) return declared;
  const names = resolveAuthoritativeIntakePartyNames(intake).filter(isAuthoritativeLegalEntityName);
  return names.length >= 3 ? names.length : 0;
}

/** A candidate party name that must never be frozen as a legal entity (placeholder / metadata). */
export function isNonAuthoritativeFreezePartyName(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (t.length < 2) return true;
  if (/^party\s*\d+$/i.test(t)) return true;
  if (isPartyMetadataFieldLabelValue(t)) return true;
  return !isAuthoritativeLegalEntityName(t);
}

/**
 * TEST536 — every freeze candidate (server_full AND deterministic recovery) must agree with the
 * authoritative intake manifest on the CORPUS party count and carry no placeholder / metadata legal
 * entities. On mismatch we throw a freeze-blocked error so the candidate is rejected before
 * acceptance and routed to premium retry/repair instead of being frozen as a source of truth (or
 * stranding the user on blank review).
 *
 * The gate keys on `prep.parties` (the resolved corpus/review party manifest) — not the parsed
 * draft object — because a professionally-deficient server draft can legitimately parse to fewer
 * draft rows while pipeline validation (not this structural gate) rejects it. What must never be
 * frozen is a corpus whose authoritative party manifest disagrees with the declared intake
 * manifest (e.g. a 3-party recovery, a dropped Client, a phantom fifth party, or a "Party 1"
 * placeholder standing in for a legal entity).
 */
export function assertPaidProFreezeCandidateManifestCountAgreement(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
): void {
  // Signer-setup resume is metadata completion only — do not treat incomplete signer fields as
  // document invalidity / freeze rejection (authority_party_count_mismatch from body-as-intake).
  if (isCreatorDashboardSignerSetupResumeActive()) return;
  const intakeManifestCount = resolveAuthoritativeIntakeManifestCount(args.intakeText);
  if (intakeManifestCount < 3) return;

  const placeholder = prep.parties.find((p) => isNonAuthoritativeFreezePartyName(p.name));
  if (placeholder) {
    throw new Error(
      `[paid-pro-sot-freeze-blocked] authority_placeholder_legal_entity:${placeholder.name.slice(0, 48)}`,
    );
  }

  const candidateCount = prep.parties.length;
  if (candidateCount !== intakeManifestCount) {
    throw new Error(
      `[paid-pro-sot-freeze-blocked] authority_party_count_mismatch:candidate=${candidateCount}!=intake=${intakeManifestCount}`,
    );
  }
}

/** Run freeze-hard gates on a prepared candidate (throws on failure). */
function resolveFreezeNoticeValidationContext(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
  acceptedCorpus: string,
) {
  const draftPartyNames = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter(Boolean);
  const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
    reviewParties: prep.reviewParties,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    acceptedCorpus,
  });
  return {
    parties,
    draftPartyNames,
    handoffPartySlots: (() => {
      const handoff = readPremiumRecipientHandoff();
      if (!handoff) return prep.reviewParties.length;
      return resolveHandoffPartySlotCount(handoff, prep.reviewParties.length);
    })(),
  };
}

function ensureGenericManifestExecutionBlockBeforeNoticeFreeze(
  safeForCommit: string,
  args: PreparePaidProFreezeCandidateArgs,
): string {
  if (/\bIN WITNESS WHEREOF\b/i.test(safeForCommit)) {
    return safeForCommit;
  }
  const manifest = manifestRecordsForPaidProAcceptance({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (!isGenericPaidProAcceptanceManifestFallback(manifest)) {
    return safeForCommit;
  }
  return appendProExecutionBlockIfMissing(safeForCommit, manifest).text;
}

function repairPaidProCanonicalNoticeAuthorityAtFreeze(
  safeForCommit: string,
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
  surface: string,
): string {
  const noticeFinalize = finalizePaidProCanonicalNoticeAuthorityForFreeze(safeForCommit, {
    reviewParties: prep.reviewParties,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: `${surface}_freeze_finalize_notices`,
  });
  if (!noticeFinalize.ok || noticeFinalize.blocked) {
    throw new Error("[paid-pro-notice-contact-authority-blocked] canonical_notice_freeze_failed");
  }
  const sealed = sealPaidProNoticesExecutionBoundaryInCorpus(noticeFinalize.text);
  const noticeValidationCtx = resolveFreezeNoticeValidationContext(prep, args, sealed.text);
  const entityHydrated = ensureOperativeNoticeStanzaEntityLinesAtFreeze(
    sealed.text,
    noticeValidationCtx.parties,
    {
      intakeText: args.intakeText ?? null,
      draftPartyNames: noticeValidationCtx.draftPartyNames,
      acceptedCorpus: sealed.text,
    },
  );
  const stanzaCountReconciled = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(
    entityHydrated.text,
    noticeValidationCtx.parties,
    {
      intakeText: args.intakeText ?? null,
      draftPartyNames: noticeValidationCtx.draftPartyNames,
      acceptedCorpus: entityHydrated.text,
    },
  );
  return stanzaCountReconciled.text;
}

function applyCanonicalNoticeAuthorityBeforeFreezeValidation(
  safeForCommit: string,
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
  surface: string,
): string {
  let text = repairPaidProCanonicalNoticeAuthorityAtFreeze(safeForCommit, prep, args, surface);
  text = ensureGenericManifestExecutionBlockBeforeNoticeFreeze(text, args);
  text = reconcileExecutionRolesBeforeFreezeCommit(text);
  const noticeValidationCtx = resolveFreezeNoticeValidationContext(prep, args, text);
  assertClauseFamilyStructuralIntegrityForFreeze(text, {
    parties: noticeValidationCtx.parties,
    surface: `${surface}_pipeline_stable_notice_authority`,
    phase: "post_acceptance",
    draftPartyCount: args.draft?.parties?.length ?? 0,
    handoffPartySlots: noticeValidationCtx.handoffPartySlots,
    intakeText: args.intakeText ?? null,
    draftPartyNames: noticeValidationCtx.draftPartyNames,
    acceptedCorpus: text,
  });
  const integrity = preparePaidProImmutableReviewedDocument(text);
  if (!isCreatorDashboardSignerSetupResumeActive()) {
    assertPaidProReviewedDocumentIntegrity(integrity.text);
  }
  return reconcileExecutionRolesBeforeFreezeCommit(integrity.text);
}

export function assertPaidProFreezeCandidateGates(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
): string {
  const surface = args.surface ?? "paid_pro_freeze_candidate";
  const inputTrimmed = trim(args.text);
  const requestedSource = args.source ?? "server_full_draft";
  const substantiveBrandWireFreeze =
    isSubstantiveBrandLicensingCorpus(inputTrimmed, args.intakeText) &&
    inputTrimmed.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;
  const inputPipelineHash = paidProPipelineAcceptedCorpusHash(inputTrimmed);
  const pipelineHash = readPaidProPipelineAcceptedCorpusHash();
  if (
    !substantiveBrandWireFreeze &&
    inputTrimmed.length >= 4000 &&
    inputPipelineHash &&
    pipelineHash &&
    inputPipelineHash === pipelineHash &&
    hasPaidProPipelineValidationForCorpus({ text: inputTrimmed, source: requestedSource })
  ) {
    return applyCanonicalNoticeAuthorityBeforeFreezeValidation(
      inputTrimmed,
      prep,
      args,
      surface,
    );
  }
  if (
    !substantiveBrandWireFreeze &&
    inputPipelineHash &&
    pipelineHash &&
    pipelineHash === inputPipelineHash &&
    hasPaidProPipelineSessionAcceptance({
      text: inputTrimmed,
      source: args.source ?? "server_full_draft",
    })
  ) {
    return applyCanonicalNoticeAuthorityBeforeFreezeValidation(
      inputTrimmed,
      prep,
      args,
      surface,
    );
  }
  const prepPipelineHash = paidProPipelineAcceptedCorpusHash(prep.text);
  if (
    !substantiveBrandWireFreeze &&
    prep.repairs.includes("freeze_prep_skipped_pipeline_stable_corpus") &&
    prepPipelineHash &&
    pipelineHash &&
    pipelineHash === prepPipelineHash &&
    hasPaidProPipelineSessionAcceptance({
      text: prep.text,
      source: args.source ?? "server_full_draft",
    })
  ) {
    return applyCanonicalNoticeAuthorityBeforeFreezeValidation(
      prep.text,
      prep,
      args,
      surface,
    );
  }

  assertPaidProFreezeCandidateManifestCountAgreement(prep, args);

  const freezeEntryText = trim(args.text);
  if (isSubstantiveBrandLicensingCorpus(freezeEntryText, args.intakeText)) {
    let substantiveText = preserveSubstantiveBrandLicensingCorpusLength(
      freezeEntryText,
      prep.text,
      args.intakeText ?? null,
    );
    const substantiveManifest = resolveAcceptanceManifestRecordsForExecution({
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
    });
    if (
      substantiveManifest.length >= 3 &&
      !isGenericPaidProAcceptanceManifestFallback(substantiveManifest)
    ) {
      const execInvariant = ensurePaidProAcceptanceExecutionBlockInvariant(
        substantiveText,
        substantiveManifest,
      );
      if (execInvariant.text !== substantiveText) {
        substantiveText = preserveSubstantiveBrandLicensingCorpusLength(
          freezeEntryText,
          execInvariant.text,
          args.intakeText ?? null,
        );
      }
      substantiveText = preserveFullLegalPartyNamesInOpeningAndSignatures(
        substantiveText,
        substantiveManifest.map((r) => r.fullLegalName).filter(Boolean),
        args.intakeText ?? null,
      );
      const trimmedNotices = trimOperativeNoticeStanzasToPartyCount(
        substantiveText,
        substantiveManifest.length,
      );
      if (trimmedNotices.repairs.length > 0) {
        substantiveText = preserveSubstantiveBrandLicensingCorpusLength(
          freezeEntryText,
          trimmedNotices.text,
          args.intakeText ?? null,
        );
      }
    }
    substantiveText = preserveSubstantiveBrandLicensingCorpusLength(
      freezeEntryText,
      substantiveText,
      args.intakeText ?? null,
    );
    substantiveText = finalizeSubstantiveBrandLicensingCorpusAfterWitness(
      freezeEntryText,
      substantiveText,
      args.intakeText ?? null,
    );
    const noticesHeading = ensureCanonicalNoticesSectionHeadingForFreeze(substantiveText);
    if (noticesHeading.text !== substantiveText) {
      substantiveText = preserveSubstantiveBrandLicensingCorpusLength(
        freezeEntryText,
        noticesHeading.text,
        args.intakeText ?? null,
      );
    }
    assertNoNumberedOperativeSectionAfterWitness(substantiveText);
    return substantiveText;
  }

  let safeForCommit = prep.text;

  safeForCommit = assertPaidProDocumentBoundaryAuthorityForFreeze(safeForCommit, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: `${surface}_pre_freeze`,
    parties: prep.reviewParties,
    draftPartyCount: args.draft?.parties?.length ?? 0,
    deferClauseFamilyStructuralValidation: true,
    handoffPartySlots: (() => {
      const handoff = readPremiumRecipientHandoff();
      if (!handoff) return prep.reviewParties.length;
      return resolveHandoffPartySlotCount(handoff, prep.reviewParties.length);
    })(),
  });
  tracePaidProAcceptancePipelineStage({
    stage: "after_applyPaidProDocumentBoundaryAuthority",
    source: args.source ?? "server_full_draft",
    text: safeForCommit,
    rawIntake: args.intakeText ?? null,
    draft: args.draft ?? null,
  });

  const postBoundaryHeading = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (postBoundaryHeading.repairs.length > 0) {
    safeForCommit = postBoundaryHeading.text;
  }
  tracePaidProAcceptancePipelineStage({
    stage: "after_heading_title_authority",
    source: args.source ?? "server_full_draft",
    text: safeForCommit,
    rawIntake: args.intakeText ?? null,
    draft: args.draft ?? null,
  });

  const postBoundaryStructure = applyPaidProSectionStructureCompletenessAuthority(safeForCommit, {
    source: `${surface}_post_boundary`,
    phase: "pre_freeze",
    blockOnFatal: false,
  });
  safeForCommit = postBoundaryStructure.text;

  const preFreezeExecutionManifest = resolveAcceptanceManifestRecordsForExecution({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (
    preFreezeExecutionManifest.length >= 2 &&
    !isGenericPaidProAcceptanceManifestFallback(preFreezeExecutionManifest) &&
    !isSubstantiveBrandLicensingCorpus(trim(args.text), args.intakeText) &&
    (preFreezeExecutionManifest.length >= 3 ||
      executionHeadingsContainIntakeInstructionLeakage(safeForCommit) ||
      !executionBlockMatchesManifestRecords(safeForCommit, preFreezeExecutionManifest))
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

  {
    const integrity = preparePaidProImmutableReviewedDocument(safeForCommit);
    safeForCommit = integrity.text;
    if (!isCreatorDashboardSignerSetupResumeActive()) {
      assertPaidProReviewedDocumentIntegrity(safeForCommit);
    }
  }

  const postNoticeStructure = applyPaidProSectionStructureCompletenessAuthority(safeForCommit, {
    source: `${surface}_post_notice_finalize`,
    phase: "pre_freeze",
    blockOnFatal: false,
  });
  safeForCommit = postNoticeStructure.text;

  const postNoticeTitleAuthority = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (postNoticeTitleAuthority.repairs.length > 0) {
    safeForCommit = postNoticeTitleAuthority.text;
  }

  const postNoticeDupDiag = diagnosePaidProCorpusDuplication(safeForCommit);
  if (
    postNoticeDupDiag.duplicateMiscellaneousSections >= 2 ||
    postNoticeDupDiag.duplicateSignaturesFollowMarkers >= 2 ||
    postNoticeDupDiag.duplicateOpeningRecitals >= 2
  ) {
    const postNoticeCorpusDuplication = repairPaidProCorpusDuplication(safeForCommit);
    if (postNoticeCorpusDuplication.repairs.length > 0) {
      safeForCommit = postNoticeCorpusDuplication.text;
    }
  }

  const postDuplicationHeading = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (postDuplicationHeading.repairs.length > 0) {
    safeForCommit = postDuplicationHeading.text;
  }

  // Hierarchy / opening integrity must land before section-structure completeness —
  // otherwise empty-parent splices are misclassified as heading-title anomalies.
  {
    const integrity = preparePaidProImmutableReviewedDocument(safeForCommit);
    safeForCommit = integrity.text;
  }

  safeForCommit = assertPaidProSectionStructureCompletenessForFreeze(
    safeForCommit,
    `${surface}_pre_freeze`,
  );

  const canonicalNoticePartyCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText ?? null,
    draftPartyNames: prep.parties.map((p) => p.name),
    manifestPartyCount: prep.parties.length,
  }).count;
  if (canonicalNoticePartyCount >= 2) {
    const preClauseNoticesHeading = ensureCanonicalNoticesSectionHeadingForFreeze(safeForCommit);
    if (preClauseNoticesHeading.repairs.length > 0) {
      safeForCommit = preClauseNoticesHeading.text;
    }
    const noticeDedupe = repairDuplicateOperativeNoticeStanzas(
      safeForCommit,
      canonicalNoticePartyCount,
      prep.parties.map((p) => p.name),
    );
    if (noticeDedupe.repairs.length > 0) {
      safeForCommit = noticeDedupe.text;
    }
    const trimmedNotices = trimOperativeNoticeStanzasToPartyCount(
      safeForCommit,
      canonicalNoticePartyCount,
    );
    if (trimmedNotices.repairs.length > 0) {
      safeForCommit = trimmedNotices.text;
    }
  }

  safeForCommit = assertProfessionalCorpusCleanForFreeze(safeForCommit, {
    partyNames: prep.parties.map((p) => p.name),
    partyCount: prep.parties.length,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
    signerNames: prep.reviewParties.map((p) => p.signerName),
    surface: `${surface}_pre_notice_finalize`,
  });

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

  const preClauseNoticesHeading = ensureCanonicalNoticesSectionHeadingForFreeze(safeForCommit);
  if (preClauseNoticesHeading.repairs.length > 0) {
    safeForCommit = preClauseNoticesHeading.text;
  }

  if (canonicalNoticePartyCount >= 2) {
    const postBoundaryNoticeDedupe = repairDuplicateOperativeNoticeStanzas(
      safeForCommit,
      canonicalNoticePartyCount,
      prep.parties.map((p) => p.name),
    );
    if (postBoundaryNoticeDedupe.repairs.length > 0) {
      safeForCommit = postBoundaryNoticeDedupe.text;
    }
    const trimmedNoticesPostBoundary = trimOperativeNoticeStanzasToPartyCount(
      safeForCommit,
      canonicalNoticePartyCount,
    );
    if (trimmedNoticesPostBoundary.repairs.length > 0) {
      safeForCommit = trimmedNoticesPostBoundary.text;
    }
  }

  if (isSubstantiveBrandLicensingCorpus(trim(args.text), args.intakeText)) {
    safeForCommit = preserveSubstantiveBrandLicensingCorpusLength(
      trim(args.text),
      safeForCommit,
      args.intakeText ?? null,
    );
  }

  const finalTitleAuthority = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (finalTitleAuthority.repairs.length > 0) {
    safeForCommit = finalTitleAuthority.text;
  }

  const partyLegalNames = prep.parties.map((p) => p.name).filter((n) => n.length >= 2);
  if (partyLegalNames.length >= 2) {
    safeForCommit = preserveFullLegalPartyNamesInOpeningAndSignatures(
      safeForCommit,
      partyLegalNames,
      args.intakeText ?? null,
    );
  }

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText ?? "") &&
    !isSubstantiveBrandLicensingCorpus(trim(args.text), args.intakeText)
  ) {
    const finalBrand = applyBrandLicensingFrozenCorpusAuthority(
      safeForCommit,
      args.draft ?? null,
      args.intakeText ?? null,
    );
    if (finalBrand.text !== safeForCommit) {
      safeForCommit = finalBrand.text;
    }
  }

  const postBrandHeading = applyPaidProSectionHeadingTitleAuthority(safeForCommit);
  if (postBrandHeading.repairs.length > 0) {
    safeForCommit = postBrandHeading.text;
  }

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText ?? "") &&
    !isSubstantiveBrandLicensingCorpus(trim(args.text), args.intakeText)
  ) {
    const postHeadingBrand = applyBrandLicensingFrozenCorpusAuthority(
      safeForCommit,
      args.draft ?? null,
      args.intakeText ?? null,
    );
    if (postHeadingBrand.text !== safeForCommit) {
      safeForCommit = postHeadingBrand.text;
    }
    const roleRepair = repairBrandLicensingRoleFidelityInCorpus(
      safeForCommit,
      args.intakeText ?? "",
      args.draft ?? null,
    );
    if (roleRepair.text !== safeForCommit) {
      safeForCommit = roleRepair.text;
    }
    assertBrandLicensingFrozenCorpusAuthorityForFreeze(
      safeForCommit,
      args.intakeText ?? null,
      args.draft ?? null,
    );
  }

  safeForCommit = preserveSubstantiveBrandLicensingCorpusLength(
    freezeEntryText,
    safeForCommit,
    args.intakeText ?? null,
  );

  if (isSubstantiveBrandLicensingCorpus(freezeEntryText, args.intakeText)) {
    const substantiveManifest = resolveAcceptanceManifestRecordsForExecution({
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
    });
    const roleReconciled = reconcileExecutionRolesBeforeFreezeCommit(safeForCommit);
    if (roleReconciled !== safeForCommit) {
      safeForCommit = preserveSubstantiveBrandLicensingCorpusLength(
        freezeEntryText,
        roleReconciled,
        args.intakeText ?? null,
      );
    }
    const substantivePartyNames = substantiveManifest.map((r) => r.fullLegalName).filter(Boolean);
    if (substantivePartyNames.length >= 2) {
      safeForCommit = preserveFullLegalPartyNamesInOpeningAndSignatures(
        safeForCommit,
        substantivePartyNames,
        args.intakeText ?? null,
      );
    }
    safeForCommit = preserveSubstantiveBrandLicensingCorpusLength(
      freezeEntryText,
      safeForCommit,
      args.intakeText ?? null,
    );
  } else {
    assertBrandLicensingFrozenCorpusAuthorityForFreeze(
      safeForCommit,
      args.intakeText ?? null,
      args.draft ?? null,
    );
  }

  // Universal pre-commit role reconcile (2-party services included).
  safeForCommit = reconcileExecutionRolesBeforeFreezeCommit(safeForCommit);

  if (isSubstantiveBrandLicensingCorpus(freezeEntryText, args.intakeText)) {
    safeForCommit = finalizeSubstantiveBrandLicensingCorpusAfterWitness(
      freezeEntryText,
      safeForCommit,
      args.intakeText ?? null,
    );
  } else {
    const postWitnessFinal = stripNumberedOperativeSectionsAfterExecution(safeForCommit);
    if (postWitnessFinal.strippedCount > 0) {
      safeForCommit = postWitnessFinal.text;
    }
  }
  assertNoNumberedOperativeSectionAfterWitness(safeForCommit);

  safeForCommit = repairPaidProCanonicalNoticeAuthorityAtFreeze(
    safeForCommit,
    prep,
    args,
    surface,
  );

  safeForCommit = ensureGenericManifestExecutionBlockBeforeNoticeFreeze(safeForCommit, args);

  const noticeValidationCtx = resolveFreezeNoticeValidationContext(prep, args, safeForCommit);
  assertClauseFamilyStructuralIntegrityForFreeze(safeForCommit, {
    parties: noticeValidationCtx.parties,
    surface: `${surface}_freeze_finalize`,
    phase: "post_acceptance",
    draftPartyCount: args.draft?.parties?.length ?? 0,
    handoffPartySlots: noticeValidationCtx.handoffPartySlots,
    intakeText: args.intakeText ?? null,
    draftPartyNames: noticeValidationCtx.draftPartyNames,
    acceptedCorpus: safeForCommit,
  });

  // Terminal integrity: notice / clause-family passes must not reintroduce empty parents,
  // duplicate openings, or unresolved identity tokens into the immutable reviewed corpus.
  {
    const integrity = preparePaidProImmutableReviewedDocument(safeForCommit);
    safeForCommit = reconcileExecutionRolesBeforeFreezeCommit(integrity.text);
    if (!isCreatorDashboardSignerSetupResumeActive()) {
      assertPaidProReviewedDocumentIntegrity(safeForCommit);
    }
  }

  return finalizePreparedFreezeCandidateText(trim(args.text), safeForCommit, {
    intakeText: args.intakeText ?? null,
    source: requestedSource,
  });
}

/** Non-throwing gate evaluation for acceptance / pipeline. */
export function evaluatePaidProFreezeCandidateGates(
  prep: PaidProFreezeCandidatePrepResult,
  args: PreparePaidProFreezeCandidateArgs,
): PaidProFreezeCandidateGateResult {
  try {
    const text = assertPaidProFreezeCandidateGates(prep, args);
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
  if (message.includes("brand_licensing_professional_corpus_defect")) {
    return "brand_licensing_professional_corpus_defect";
  }
  if (message.includes("brand_licensing_section_structure_anomaly")) {
    return message.match(/brand_licensing_section_structure_anomaly:\d+/)?.[0] ?? "brand_licensing_section_structure_anomaly";
  }
  if (message.includes("section_heading_title_anomaly")) return "section_heading_title_anomaly";
  if (message.includes("missing_notices_heading")) return "missing_notices_heading";
  if (message.includes("section_structure_synthetic_malformed_headings")) {
    return "section_structure_synthetic_malformed_headings";
  }
  if (message.includes("section_structure_completeness_unresolved")) {
    return "section_structure_completeness_unresolved";
  }
  if (message.includes("[paid-pro-clause-family-structural-blocked]")) {
    const codes = message.match(/codes=([^\s]+(?:,[^\s]+)*)/)?.[1];
    return codes?.split(",")[0] ?? "clause_family_structural";
  }
  if (message.includes("[paid-pro-document-boundary-blocked]")) {
    // TEST563 — preserve the specific blocker (structural violation names or the exact unresolved
    // render tokens) so `[paid-pro-validation-decision] rejectedRule` proves the real defect instead
    // of collapsing every boundary block to a bare `document_boundary_blocked`.
    const detail = message
      .match(/\[paid-pro-document-boundary-blocked\]\s*(?:violations=)?(.+)/)?.[1]
      ?.trim();
    if (detail && detail !== "contact") {
      return `document_boundary_blocked:${detail.slice(0, 120)}`;
    }
    return "document_boundary_blocked";
  }
  if (message.includes("unresolved_render_tokens")) return "unresolved_render_tokens";
  if (message.includes("[paid-pro-reviewed-document-integrity-blocked]")) {
    return (
      message
        .replace(/^\[paid-pro-reviewed-document-integrity-blocked\]\s*/i, "")
        .split(",")[0]
        ?.trim() || "reviewed_document_integrity"
    );
  }
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
  tracePaidProAcceptancePipelineStage({
    stage: "validatePaidProOutput_validation_input",
    source: args.source ?? "server_full_draft",
    text: prep.text,
    rawIntake: args.intakeText ?? null,
    draft: args.draft ?? null,
  });
  const result = evaluatePaidProFreezeCandidateGates(prep, args);
  tracePaidProAcceptancePipelineStage({
    stage: "after_buildPaidProFreezeCandidate",
    source: args.source ?? "server_full_draft",
    text: result.text,
    rejectReason: result.rejectReason,
    rawIntake: args.intakeText ?? null,
    draft: args.draft ?? null,
  });
  return result;
}

/**
 * Resolve freeze-gated authoritative text for pipeline acceptance / SoT commit.
 * When gates pass, returns the repaired corpus that freeze establishment must use — not the raw server body.
 */
export function resolvePaidProFreezeCommitText(
  args: PreparePaidProFreezeCandidateArgs,
): PaidProFreezeCandidateGateResult {
  const result = buildPaidProFreezeCandidate(args);
  return result;
}

/** Preview whether deterministic recovery can pass freeze gates (no SoT commit). */
export function previewRecoverPaidProFreezeCandidate(
  args: {
    draft: ParsedDraftShape | null;
    intakeText: string;
    surface?: string;
  },
): PaidProFreezeCandidateGateResult {
  const baseDraft =
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

  // TEST536 — deterministic recovery must build against the authoritative intake manifest, not a
  // drifted draft that dropped a party. Repairing the draft party rows from intake authority keeps
  // draft/candidate/notice/signature counts aligned so a valid recovery renders (and the freeze
  // manifest-count gate rejects anything still mismatched instead of freezing a wrong-N corpus).
  const draft: ParsedDraftShape = {
    ...baseDraft,
    parties: repairDraftPartiesFromIntakeAuthority(
      (baseDraft.parties ?? []) as never[],
      args.intakeText,
    ) as never[],
  };

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
  // TEST541 — a failed freeze/validation attempt must not leave its safe-display bytes memoized;
  // otherwise the retry re-runs against the same intake, hits the stale cache, and re-fails
  // identically (the excess_party_notice_stanzas retry loop). Clear the memo so retry recomputes.
  clearAcceptedProCorpusSafeDisplayCache();
  logProCorpusSourceMap({
    stage: "client_gates_passed",
    source: "paid_pro_freeze_candidate",
    len: 0,
    text: "",
    allowedToOverride: false,
    reason: "partial_authoritative_state_cleared_sot_freeze_failed",
  });
}

export { beginPaidProGenerationAttempt } from "./paidProGenerationAttemptAuthority";
