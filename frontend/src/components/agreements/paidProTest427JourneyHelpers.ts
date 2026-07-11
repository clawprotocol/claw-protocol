/**
 * TEST427 — full Genesis Dog production workflow runner (intake → dashboard).
 */

import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../../agreement/agreementWorkspaceApi";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  createCoordinatorProfile,
  legalPartyIdentitiesExcludingCoordinator,
  normalizePartyIdentities,
} from "./canonicalPartyIdentityModel";
import { isAgreementCompletedForDashboard } from "../../launch/creatorDashboardAgreementCompletion";
import { resolveCreatorDashboardReviewGate } from "../../launch/creatorDashboardReviewGate";
import { deriveCreatorDashboardStatusPillFromGate } from "../../launch/creatorDashboardPresentation";
import {
  buildAgreementVs01BridgeSession,
  mergeLiveDraftWithRecipientSetupForVs01Bridge,
  type AgreementVs01BridgeSession,
  type RecipientSetupEmailInput,
} from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  acceptUploadedRevision,
  applyUploadedRevisionCandidate,
  assertGuidedPostFinalReviewTransition,
  buildCanonicalSignerManifest,
  createInitialReviewContinuityState,
  markReviewApprovedForSigning,
} from "./guidedDealCompletion/guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { evaluateProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  hasFrozenPaidProAuthoritativeSnapshot,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import { clearStaleAcceptedButUnfrozenProCorpus, rejectedProCorpusHash } from "./paidProStaleAcceptedUnfrozenCorpus";
import { latchAcceptedServerFullDraftAuthority, LONG_PREMIUM_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  assertAuthorityPartiesMetadata,
  assertCanonicalPartyCount,
  assertCorpusNPartyStructure,
  assertHandoffSlotIntegrity,
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import { buildStructuralFreezeRejectCorpus } from "./paidProTest424Fixtures";
import {
  buildTest427Corpus,
  scenarioAuthorityParties427,
  TEST427_FORBIDDEN_ENTITY_MARKERS,
  type Test427Scenario,
} from "./paidProTest427Fixtures";
import { test427Fail } from "./paidProTest427JourneyMatrix";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
  signerKeyForHandoffRow,
} from "../../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../../vs01/vs01PaidProPostSignHandoff";
import { writePaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";
import { isAgreementFullySignedLocal } from "../../vs01/vs01WorkspaceSigningStatus";

function minWorkflowCorpusLen(expectedN: number): number {
  return Math.max(2000, expectedN * 650);
}

function buildJourneyCorpus(scenario: Test427Scenario): string {
  return padOperativeCorpusBeforeWitness(
    buildTest427Corpus(scenario),
    Math.max(5200, scenario.expectedN * 900),
  );
}

const PLACEHOLDER_MARKERS = ["[PARTY NAME]", "[ENTITY NAME]", "TBD", "INSERT NAME"] as const;

function assertNoFixtureContamination(stage: string, text: string): void {
  const upper = text.toUpperCase();
  for (const marker of TEST427_FORBIDDEN_ENTITY_MARKERS) {
    if (upper.includes(marker)) {
      test427Fail("draft_generation", `${stage}: fixture contamination: ${marker}`);
    }
  }
  for (const marker of PLACEHOLDER_MARKERS) {
    if (text.includes(marker)) {
      test427Fail("review_render", `${stage}: placeholder leakage: ${marker}`);
    }
  }
}

function workspaceIndexRow(
  agreementId: string,
  scenario: Test427Scenario,
  overrides: Partial<WorkspaceIndexAgreement> = {},
): WorkspaceIndexAgreement {
  return {
    id: agreementId,
    title: scenario.draft.title ?? "Agreement",
    updated_at: new Date().toISOString(),
    party_count: scenario.expectedN,
    signer_count: scenario.expectedN,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: true,
    locked_version_id: "v1",
    workspace_archived_at: null,
    review_sent_at: new Date().toISOString(),
    reviewer_approved: true,
    all_reviewers_approved: true,
    review_approvals_required: scenario.expectedN,
    review_approvals_completed: scenario.expectedN,
    ...overrides,
  };
}

function scenarioToAgreementDraft(scenario: Test427Scenario, agreementId: string): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: agreementId,
    title: scenario.draft.title ?? "Agreement",
    jurisdiction: scenario.draft.jurisdiction ?? "Delaware",
    parties: scenario.parties.map((name, i) => ({
      id: `party_${i}`,
      name,
      role: i === 0 ? "owner" : "signer",
      email: scenario.emails[i] ?? "",
    })),
    purpose: scenario.draft.purpose ?? "",
    payment_terms: scenario.draft.payment_terms ?? "",
    duration: scenario.draft.duration ?? null,
    due_date: scenario.draft.due_date ?? null,
    effective_date: scenario.draft.effective_date ?? null,
    created_at: now,
    updated_at: now,
    versions: [{ version: 1, created_at: now }],
    audit_log: [],
    creator_coordinator_only: scenario.coordinatorOnly ?? false,
    agreement_document_text: getPaidProSourceOfTruthText() || undefined,
  } as AgreementDraft;
}

function assertFrozenCorpusIntegrity(stage: string, scenario: Test427Scenario, corpus: string): void {
  assertCorpusNPartyStructure({
    expectedN: scenario.expectedN,
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    parties: scenario.parties,
    signerNames: scenario.signerNames,
    corpus,
    requireNoticeStanzas: scenario.requireNoticeStanzas ?? true,
  });
  const contamination = evaluateProfessionalCorpusContamination(corpus);
  if (!contamination.ok) {
    test427Fail("freeze_establish", `${stage}: corpus contamination: ${contamination.issues.map((i) => i.code).join("; ")}`);
  }
  assertNoFixtureContamination(stage, corpus);
}

function establishScenarioSoT(
  scenario: Test427Scenario,
  corpus: string,
  opts?: { allowShorterOverwrite?: boolean },
): string {
  const prep = preparePaidProServerDocumentForAcceptance(corpus, scenario.draft, scenario.intakeText);
  const accepted = padOperativeCorpusBeforeWitness(prep.text, 2000);
  markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });
  assertCanonicalPartyCount("freeze_establish", scenario.intakeText, scenario.draft, scenario.expectedN, accepted);
  establishPaidProSourceOfTruth({
    text: accepted,
    source: "server_full_draft",
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    allowShorterOverwrite: opts?.allowShorterOverwrite ?? false,
  });
  if (!hasPaidProSourceOfTruth()) {
    test427Fail("freeze_establish", "SoT not established");
  }
  if (!hasFrozenPaidProAuthoritativeSnapshot()) {
    test427Fail("freeze_establish", "frozen authoritative snapshot missing");
  }
  const sot = getPaidProSourceOfTruthText();
  if (readFrozenCanonicalManifestPartyCount() !== scenario.expectedN) {
    test427Fail("freeze_establish", `manifest party count ${readFrozenCanonicalManifestPartyCount()} !== ${scenario.expectedN}`);
  }
  assertFrozenCorpusIntegrity("freeze_establish", scenario, sot);
  return sot;
}

function buildLiveUiFromAuthorityParties(
  authorityParties: PaidProSignerMetadataParty[],
): import("./paidProSignerMetadataAuthority").LiveSignerMetadataUiState {
  return {
    partyCount: authorityParties.length,
    recipient1Name: authorityParties[0]?.partyLegalName ?? "",
    recipient2Name: authorityParties[1]?.partyLegalName ?? "",
    recipient1Email: authorityParties[0]?.signerEmail ?? "",
    recipient2Email: authorityParties[1]?.signerEmail ?? "",
    extraPartyReviewEmails: authorityParties.slice(2).map((p) => p.signerEmail),
    extraPartyLegalNames: authorityParties.slice(2).map((p) => p.partyLegalName),
    partySignerNames: authorityParties.map((p) => p.signerName),
    partySignerTitles: authorityParties.map((p) => p.signerTitle),
    partyAddresses: authorityParties.map((p) => p.partyAddress),
  };
}

function completeAuthorityParties(scenario: Test427Scenario): PaidProSignerMetadataParty[] {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail:
      scenario.emails[partyIndex]?.includes("@")
        ? scenario.emails[partyIndex]!
        : `complete.party${partyIndex}@genesisdog427.example.com`,
    signerName:
      (scenario.signerNames[partyIndex] ?? "").trim().length >= 2
        ? scenario.signerNames[partyIndex]!
        : `Signer Party ${partyIndex + 1}`,
    signerTitle:
      (scenario.signerTitles[partyIndex] ?? "").trim().length >= 2
        ? scenario.signerTitles[partyIndex]!
        : "Authorized Signatory",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
}

function finalizeSignerWorkflow(
  scenario: Test427Scenario,
  authorityParties: PaidProSignerMetadataParty[],
): PaidProSignerMetadataAuthority {
  clearPremiumPartyNamesHandoff();
  writePremiumRecipientHandoffFromAuthorityParties(authorityParties);
  const handoff = readPremiumRecipientHandoff();
  const slots = linearPremiumRecipientSlots(handoff, scenario.expectedN);
  if (slots.length !== scenario.expectedN) {
    test427Fail("signer_setup", `handoff slots ${slots.length}`);
  }
  if (!scenarioHasPartialMetadata(scenario)) {
    assertHandoffSlotIntegrity(handoff, scenario.expectedN, scenario.parties);
  } else {
    for (let i = 0; i < scenario.expectedN; i++) {
      if (!slots[i]!.email.includes("@")) {
        test427Fail("signer_setup", `slot ${i} email missing after completion`);
      }
      if (!slots[i]!.name.toLowerCase().includes(scenario.parties[i]!.split(" ")[0]!.toLowerCase())) {
        test427Fail("signer_setup", `slot ${i} entity mismatch`);
      }
    }
  }
  const finalizeAuthority = scenarioHasPartialMetadata(scenario)
    ? {
        parties: authorityParties,
        source: "authoritative_write" as const,
        hash: `test427_${scenario.id}`,
        updatedAt: Date.now(),
      }
    : buildPaidProSignerMetadataAuthorityForFinalize(
        buildLiveUiFromAuthorityParties(authorityParties),
        { intakeText: scenario.intakeText, draftPartyNames: scenario.parties.slice(0, 2) as string[] },
      );
  if (finalizeAuthority.parties.length !== scenario.expectedN) {
    test427Fail("signer_setup", `finalize authority party count ${finalizeAuthority.parties.length}`);
  }
  if (!scenarioHasPartialMetadata(scenario)) {
    assertAuthorityPartiesMetadata(
      "signer_setup",
      finalizeAuthority.parties,
      scenario.parties,
      completeAuthorityParties(scenario).map((p) => p.signerName),
    );
  }
  writePremiumRecipientHandoffFromAuthorityParties(finalizeAuthority.parties);
  setConsumedPaidProSignerMetadataAuthority(finalizeAuthority);
  return finalizeAuthority;
}

function recipientSetupFromScenario(scenario: Test427Scenario): RecipientSetupEmailInput {
  const handoff = readPremiumRecipientHandoff();
  const slots = linearPremiumRecipientSlots(handoff, scenario.expectedN);
  return {
    recipient1Email: slots[0]?.email ?? "",
    recipient2Email: slots[1]?.email ?? "",
    recipientPartyEmails: slots.map((s) => s.email),
    recipientPartySignerNames: slots.map((s) => s.signerName ?? ""),
    recipientPartySignerTitles: slots.map((s) => s.signerTitle ?? ""),
    creatorCoordinatorOnly: scenario.coordinatorOnly ?? false,
  };
}

function buildHandoffFromBridge(
  agreementId: string,
  scenario: Test427Scenario,
  bridge: AgreementVs01BridgeSession,
): PaidProVs01PostSignHandoffV1 {
  return {
    v: 1,
    agreementId,
    agreementTitle: scenario.draft.title ?? "Agreement",
    vs01DocumentId: bridge.vs01DocumentId,
    receiptId: "",
    receiptHashSha256: null,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: `vs01r:${agreementId}:owner`,
    ownerSigningUrl: `https://example.test/${agreementId}/owner`,
    signers: bridge.counterparties.map((cp, i) => ({
      counterpartyId: cp.id,
      displayName: cp.name || scenario.parties[i + 1] || `Party ${i + 2}`,
      email: cp.email,
      signingUrl: `https://example.test/${agreementId}/signer/${i}`,
      signerRoleId: `vs01r:${agreementId}:cp_${i}`,
    })),
    packetPrepareOnly: true,
    senderMustSignFirst: false,
  };
}

function simulateAllSignersSigned(handoff: PaidProVs01PostSignHandoffV1): void {
  const ownerKey = handoff.ownerSignerRoleId ?? "owner";
  ensureSigningPacketStatusFromHandoff(handoff, ownerKey);
  patchSignerPacketStatus(handoff.agreementId, ownerKey, "signed");
  for (const signer of handoff.signers) {
    const key = signerKeyForHandoffRow(signer, signer.signerRoleId);
    patchSignerPacketStatus(handoff.agreementId, key, "signed");
  }
}

function runRecoveryIfNeeded(scenario: Test427Scenario): void {
  if (!scenario.recoveryMode) return;

  const cleanCorpus = buildJourneyCorpus(scenario);
  const malformed = buildStructuralFreezeRejectCorpus(cleanCorpus);
  const malformedHash = rejectedProCorpusHash(malformed);
  if (!malformedHash) {
    test427Fail("recovery_workflow", "malformed corpus hash missing");
  }

  markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft" });
  latchAcceptedServerFullDraftAuthority(
    malformed.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN
      ? malformed
      : `${malformed}\n\n${"Supplemental clause. ".repeat(400)}`,
    "server_full_draft",
  );

  try {
    establishPaidProSourceOfTruth({
      text: malformed,
      source: "server_full_draft",
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    });
    if (scenario.recoveryMode === "freeze_rejection" || scenario.recoveryMode === "structural_rejection") {
      test427Fail("recovery_workflow", "malformed corpus established SoT without rejection");
    }
  } catch {
    if (hasPaidProSourceOfTruth()) {
      clearPaidProSourceOfTruth();
    }
  }

  if (hasPaidProSourceOfTruth() && scenario.recoveryMode !== "stale_accepted") {
    test427Fail("recovery_workflow", "SoT present after rejection");
  }

  if (scenario.recoveryMode === "stale_accepted" || scenario.recoveryMode === "freeze_rejection") {
    clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: malformed, reason: "test427" });
  }

  const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    source: "server_full_draft",
  });
  if (!recovered.ok) {
    test427Fail("recovery_workflow", recovered.reason ?? "recovery failed");
  }

  const sot = getPaidProSourceOfTruthText();
  if (rejectedProCorpusHash(sot) === malformedHash) {
    test427Fail("recovery_workflow", "rejected corpus hash reused");
  }
  assertCanonicalPartyCount("recovery_workflow", scenario.intakeText, scenario.draft, scenario.expectedN, sot);
  assertFrozenCorpusIntegrity("recovery_workflow", scenario, sot);
}

function assertCoordinatorExclusion(scenario: Test427Scenario, sot: string): void {
  const coordinator = createCoordinatorProfile({
    isUser: true,
    email: "paige.orchestrator@coord.example.com",
    displayName: "Paige Orchestrator",
    userRelation: "coordinator",
  });
  const parties = normalizePartyIdentities({
    intakeText: scenario.intakeText,
    userIsCoordinatorOnly: true,
    coordinator,
    authorityParties: scenarioAuthorityParties427(scenario),
  });
  const legal = legalPartyIdentitiesExcludingCoordinator(parties, coordinator, true);
  if (legal.length !== scenario.expectedN) {
    test427Fail("coordinator_exclusion", `legal parties ${legal.length} !== ${scenario.expectedN}`);
  }
  if (legal.some((p) => /coordinator|paige orchestrator/i.test(p.legalName))) {
    test427Fail("coordinator_exclusion", "coordinator in legal party list");
  }
  const noticeCount = countOperativeIfToNoticeStanzas(sot);
  if (noticeCount > scenario.expectedN) {
    test427Fail("coordinator_exclusion", `notice stanzas ${noticeCount} > ${scenario.expectedN}`);
  }
  const tailBlocks = countPartyBlocksInExecutionTail(sot, scenario.parties);
  if (tailBlocks !== scenario.expectedN) {
    test427Fail("coordinator_exclusion", `execution blocks ${tailBlocks}`);
  }
}

function scenarioHasPartialMetadata(scenario: Test427Scenario): boolean {
  return (
    scenario.emails.some((e) => !(e || "").includes("@")) ||
    scenario.signerNames.some((n) => !(n || "").trim()) ||
    scenario.signerTitles.some((t) => !(t || "").trim())
  );
}

function completeMetadataIfNeeded(scenario: Test427Scenario): PaidProSignerMetadataParty[] {
  const partial = scenarioAuthorityParties427(scenario);
  writePremiumRecipientHandoffFromAuthorityParties(partial);
  if (!scenarioHasPartialMetadata(scenario)) {
    assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), scenario.expectedN, scenario.parties);
  }

  if (scenario.category === "metadata_stress" || scenarioHasPartialMetadata(scenario)) {
    if (!scenarioHasPartialMetadata(scenario)) {
      test427Fail("metadata_completion", "metadata_stress scenario missing partial fields");
    }
    const complete = completeAuthorityParties(scenario);
    clearPremiumPartyNamesHandoff();
    writePremiumRecipientHandoffFromAuthorityParties(complete);
    return complete;
  }

  return completeAuthorityParties(scenario);
}

function assertVs01AndCompletion(
  scenario: Test427Scenario,
  agreementId: string,
  authority: PaidProSignerMetadataAuthority,
): void {
  const draft = scenarioToAgreementDraft(scenario, agreementId);
  const recipientSetup = recipientSetupFromScenario(scenario);
  const mergedDraft = mergeLiveDraftWithRecipientSetupForVs01Bridge(draft, recipientSetup) ?? draft;
  const bridge = buildAgreementVs01BridgeSession({
    agreementId,
    vs01DocumentId: `doc_${agreementId}`,
    draft: mergedDraft,
    senderFirstLawdogHandoff: true,
    agreementCorpusText: getPaidProSourceOfTruthText(),
    recipientSetup,
  });

  const emailCount = [bridge.creatorEmail, ...bridge.counterparties.map((c) => c.email)].filter((e) =>
    e.includes("@"),
  ).length;
  if (emailCount < scenario.expectedN) {
    test427Fail("vs01_bridge", `emails ${emailCount} < ${scenario.expectedN}`);
  }
  for (let i = 0; i < scenario.expectedN; i++) {
    const expectedEmail = completeAuthorityParties(scenario)[i]!.signerEmail;
    const slotEmail =
      i === 0
        ? bridge.creatorEmail
        : bridge.counterparties[i - 1]?.email ?? "";
    if (!slotEmail.includes("@")) {
      test427Fail("vs01_bridge", `missing email slot ${i}`);
    }
    if (expectedEmail.includes("@") && slotEmail !== expectedEmail) {
      // allow generated completion emails for partial metadata
      if (!slotEmail.includes("genesisdog427")) {
        test427Fail("vs01_bridge", `email mismatch slot ${i}`);
      }
    }
  }

  if (scenario.coordinatorOnly && bridge.counterparties.length >= scenario.expectedN) {
    test427Fail("vs01_bridge", "coordinator included in VS01 counterparties");
  }

  const handoff = buildHandoffFromBridge(agreementId, scenario, bridge);
  writePaidProVs01PostSignHandoff(handoff);
  simulateAllSignersSigned(handoff);

  if (!isAgreementFullySignedLocal(agreementId)) {
    test427Fail("signature_completion", "signing packet not fully signed");
  }

  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: getPaidProSourceOfTruthText(),
    authority,
    intakeRaw: scenario.intakeText,
    surface: "test427_completion",
    signatureRegionOnly: false,
    repairRecital: true,
  });
  if (hydrated.rejected) {
    test427Fail("completed_corpus", `hydration rejected: ${hydrated.rejectReason ?? "unknown"}`);
  }
  const partyBlocks = countPartyBlocksInExecutionTail(hydrated.corpus, scenario.parties);
  if (partyBlocks !== scenario.expectedN) {
    test427Fail("completed_corpus", `execution party blocks ${partyBlocks} !== ${scenario.expectedN}`);
  }
  if (countPaidProExecutionBlocks(executionTail(hydrated.corpus)) > scenario.expectedN) {
    test427Fail("completed_corpus", "duplicate execution blocks");
  }
  for (const party of scenario.parties) {
    if (!hydrated.corpus.toLowerCase().includes(party.toLowerCase().replace(/\.$/, ""))) {
      test427Fail("completed_corpus", `missing entity ${party}`);
    }
  }
  for (const auth of authority.parties) {
    if (auth.partyLegalName === auth.signerName) {
      test427Fail("completed_corpus", `signer leaked into entity: ${auth.partyLegalName}`);
    }
  }

  const completedRow = workspaceIndexRow(agreementId, scenario, { completed_signed: true });
  if (!isAgreementCompletedForDashboard(completedRow)) {
    test427Fail("dashboard_state", "dashboard completion not detected");
  }
  const gate = resolveCreatorDashboardReviewGate(completedRow, []);
  const pill = deriveCreatorDashboardStatusPillFromGate(completedRow, gate);
  if (pill && pill.toLowerCase().includes("waiting")) {
    test427Fail("dashboard_state", `dashboard pill waiting: ${pill}`);
  }
}

/**
 * Full Genesis Dog production workflow — every stage from intake through dashboard completion.
 */
export function runTest427ProductionWorkflow(scenario: Test427Scenario): void {
  const agreementId = `ag_test427_${scenario.id}`;
  clearConsumedPaidProSignerMetadataAuthority();

  // Recovery path (Category G) before clean establish
  if (scenario.recoveryMode) {
    runRecoveryIfNeeded(scenario);
  }

  // Draft generation
  const corpus = buildJourneyCorpus(scenario);
  if (corpus.trim().length < minWorkflowCorpusLen(scenario.expectedN)) {
    test427Fail("draft_generation", `corpus too short (${corpus.trim().length})`);
  }
  assertNoFixtureContamination("draft_generation", corpus);
  for (const party of scenario.parties) {
    if (!corpus.includes(party.split(" ")[0]!)) {
      test427Fail("draft_generation", `draft missing party ${party}`);
    }
  }

  // Freeze / SoT (skip if recovery already established)
  const sot =
    scenario.recoveryMode && hasPaidProSourceOfTruth()
      ? getPaidProSourceOfTruthText()
      : establishScenarioSoT(scenario, corpus);

  // Review render
  if (!hasCanonicalReviewCorpusForRender()) {
    test427Fail("review_render", "review corpus not mounted");
  }
  const review = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  if (review.trim().length < minWorkflowCorpusLen(scenario.expectedN)) {
    test427Fail("review_render", `review too short (${review.trim().length})`);
  }
  for (const party of scenario.parties) {
    if (!review.includes(party.split(" ")[0]!)) {
      test427Fail("review_render", `review missing party ${party}`);
    }
  }
  assertNoFixtureContamination("review_render", review);
  if (countPaidProExecutionBlocks(review) !== 1) {
    test427Fail("review_render", `review execution blocks ${countPaidProExecutionBlocks(review)}`);
  }

  // Revision flow → re-freeze
  let continuity = createInitialReviewContinuityState(sot);
  const termMatch = sot.match(/\b(\d+)\s+months?\b/i);
  const revisedToken = termMatch ? `${Number(termMatch[1]) + 6} months` : `TEST427-EXT-${scenario.id}`;
  const revisedCorpus = termMatch
    ? sot.replace(termMatch[0], revisedToken)
    : `${sot}\n\n11. Operational Extension\n\nParties agree to ${revisedToken} of continued cooperation.\n`;

  continuity = applyUploadedRevisionCandidate(continuity, revisedCorpus);
  if (continuity.reviewSessionState !== "revision_uploaded") {
    test427Fail("revision_flow", "revision not uploaded");
  }
  continuity = acceptUploadedRevision(continuity);
  if (!continuity.latestAcceptedCorpus.includes(revisedToken)) {
    test427Fail("revision_flow", `accepted revision missing token: ${revisedToken}`);
  }

  const reEstablished = establishScenarioSoT(scenario, continuity.latestAcceptedCorpus, {
    allowShorterOverwrite: true,
  });
  if (!reEstablished.includes(revisedToken)) {
    test427Fail("revision_flow", `re-established SoT missing approved revision: ${revisedToken}`);
  }
  if (readFrozenCanonicalManifestPartyCount() !== scenario.expectedN) {
    test427Fail("revision_flow", "party count changed after re-freeze");
  }
  continuity = markReviewApprovedForSigning(continuity);
  if (continuity.reviewSessionState !== "approved_for_signing") {
    test427Fail("revision_flow", "not approved_for_signing");
  }

  const identities = normalizePartyIdentities({
    intakeText: scenario.intakeText,
    authorityParties: completeAuthorityParties(scenario),
  });
  const manifestIdentities: CanonicalPartyIdentity[] = identities.map((id, index) => ({
    index,
    partyDisplayName: id.legalName,
    email: id.signerEmail?.trim() || id.noticeEmail?.trim() || "",
    partyAddress: id.noticeAddress ?? null,
    representativeName: id.signerName?.trim() || id.legalName,
    title: id.signerTitle?.trim() || null,
    blockHeading: id.roleLabel?.trim() || `PARTY ${index + 1}`,
    isIndividual: false,
  }));
  const manifest = buildCanonicalSignerManifest({ identities: manifestIdentities, signFirst: false });
  const transition = assertGuidedPostFinalReviewTransition({
    action: "signing_confirm",
    acceptedCorpus: continuity.latestAcceptedCorpus,
    authoritativeCorpus: reEstablished,
    signerManifest: manifest,
    renderablePreview: resolvePaidProReviewRenderPlain({
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    }),
  });
  if (!transition.ok) {
    test427Fail("revision_flow", `guided transition blocked: ${transition.reason ?? "unknown"}`);
  }

  // Coordinator exclusion checks
  if (scenario.coordinatorOnly) {
    assertCoordinatorExclusion(scenario, reEstablished);
  }

  // Signer setup + metadata completion
  const authorityParties = completeMetadataIfNeeded(scenario);
  runPaidProSignerMetadataAuthoritySeed({
    stage: `test427_${scenario.id}`,
    legalEntities: [...scenario.parties],
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    handoff: readPremiumRecipientHandoff(),
    uiSignerNames: authorityParties.map((p) => p.signerName).slice(0, 2),
    uiSignerTitles: authorityParties.map((p) => p.signerTitle).slice(0, 2),
    authoritativePartyCount: scenario.expectedN,
  });
  const authority = finalizeSignerWorkflow(scenario, authorityParties);

  const gated = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
    partySlotCount: scenario.expectedN,
  });
  const slots = linearPremiumRecipientSlots(gated, scenario.expectedN);
  if (slots.length !== scenario.expectedN) {
    test427Fail("recipient_handoff", `handoff slots ${slots.length}`);
  }
  if (slots.some((s) => !s.email.includes("@"))) {
    test427Fail("recipient_handoff", "handoff emails incomplete after finalize");
  }

  // VS01 bridge → signature completion → completed corpus → dashboard
  assertVs01AndCompletion(scenario, agreementId, authority);

  if (resolveCanonicalReviewCorpusLenForRender() < minWorkflowCorpusLen(scenario.expectedN)) {
    test427Fail("dashboard_state", "canonical review len too low at end");
  }
}
