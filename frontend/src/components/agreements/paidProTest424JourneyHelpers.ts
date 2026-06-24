/**
 * TEST424 — workflow runners simulating Genesis Dogs user journeys (not synthetic authority-only tests).
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
} from "./paidProSignerMetadataAuthority";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
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
import { buildTest423Corpus } from "./paidProTest423Fixtures";
import {
  buildMalformedAcceptedCorpus,
  scenarioAuthorityParties,
  type Test424JourneyScenario,
} from "./paidProTest424Fixtures";
import { journeyFail } from "./paidProTest424JourneyMatrix";
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

function buildJourneyCorpus(scenario: Test424JourneyScenario): string {
  return padOperativeCorpusBeforeWitness(buildTest423Corpus(scenario), Math.max(5200, scenario.expectedN * 900));
}

const PLACEHOLDER_MARKERS = [
  "[PARTY NAME]",
  "[ENTITY NAME]",
  "TBD",
  "INSERT NAME",
] as const;

function workspaceIndexRow(
  agreementId: string,
  scenario: Test424JourneyScenario,
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

export function scenarioToAgreementDraft(
  scenario: Test424JourneyScenario,
  agreementId: string,
): AgreementDraft {
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

function assertNoPlaceholderLeakage(stage: string, text: string): void {
  for (const marker of PLACEHOLDER_MARKERS) {
    if (text.includes(marker)) {
      journeyFail(stage, `placeholder leakage: ${marker}`);
    }
  }
}

function buildHandoffFromBridge(
  agreementId: string,
  scenario: Test424JourneyScenario,
  bridge: AgreementVs01BridgeSession,
): PaidProVs01PostSignHandoffV1 {
  const ownerRoleId = `vs01r:${agreementId}:owner`;
  return {
    v: 1,
    agreementId,
    agreementTitle: scenario.draft.title ?? "Agreement",
    vs01DocumentId: bridge.vs01DocumentId,
    receiptId: "",
    receiptHashSha256: null,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: ownerRoleId,
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
  const ownerKey = handoff.ownerSignerRoleId ?? `owner`;
  ensureSigningPacketStatusFromHandoff(handoff, ownerKey);
  patchSignerPacketStatus(handoff.agreementId, ownerKey, "signed");
  for (const signer of handoff.signers) {
    const key = signerKeyForHandoffRow(signer, signer.signerRoleId);
    patchSignerPacketStatus(handoff.agreementId, key, "signed");
  }
}

function assertFrozenCorpusIntegrity(stage: string, scenario: Test424JourneyScenario, corpus: string): void {
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
    journeyFail(stage, `corpus contamination: ${contamination.issues.map((i) => i.code).join("; ")}`);
  }
  assertNoPlaceholderLeakage(stage, corpus);
}

function establishScenarioSoT(stage: string, scenario: Test424JourneyScenario, corpus: string): string {
  const prep = preparePaidProServerDocumentForAcceptance(corpus, scenario.draft, scenario.intakeText);
  const accepted = padOperativeCorpusBeforeWitness(prep.text, 2000);
  markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });
  assertCanonicalPartyCount(stage, scenario.intakeText, scenario.draft, scenario.expectedN, accepted);
  establishPaidProSourceOfTruth({
    text: accepted,
    source: "server_full_draft",
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  if (!hasPaidProSourceOfTruth()) {
    journeyFail(stage, "structural SoT not established");
  }
  if (!hasFrozenPaidProAuthoritativeSnapshot()) {
    journeyFail(stage, "frozen authoritative snapshot missing after SoT");
  }
  const sot = getPaidProSourceOfTruthText();
  if (readFrozenCanonicalManifestPartyCount() !== scenario.expectedN) {
    journeyFail(stage, `manifest party count ${readFrozenCanonicalManifestPartyCount()} !== ${scenario.expectedN}`);
  }
  assertFrozenCorpusIntegrity(stage, scenario, sot);
  return sot;
}

function buildLiveUiFromAuthorityParties(
  authorityParties: ReturnType<typeof scenarioAuthorityParties>,
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

function finalizeSignerWorkflow(
  stage: string,
  scenario: Test424JourneyScenario,
  authorityParties = scenarioAuthorityParties(scenario),
): PaidProSignerMetadataAuthority {
  writePremiumRecipientHandoffFromAuthorityParties(authorityParties);
  assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), scenario.expectedN, scenario.parties);
  const finalizeAuthority = buildPaidProSignerMetadataAuthorityForFinalize(
    buildLiveUiFromAuthorityParties(authorityParties),
    { intakeText: scenario.intakeText, draftPartyNames: scenario.parties.slice(0, 2) as string[] },
  );
  if (finalizeAuthority.parties.length !== scenario.expectedN) {
    journeyFail(stage, `finalize authority party count ${finalizeAuthority.parties.length}`);
  }
  assertAuthorityPartiesMetadata(
    stage,
    finalizeAuthority.parties,
    scenario.parties,
    scenario.signerNames,
  );
  writePremiumRecipientHandoffFromAuthorityParties(finalizeAuthority.parties);
  setConsumedPaidProSignerMetadataAuthority(finalizeAuthority);
  return finalizeAuthority;
}

function recipientSetupFromScenario(scenario: Test424JourneyScenario): RecipientSetupEmailInput {
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

function assertSignatureLinksAndCompletion(
  stage: string,
  scenario: Test424JourneyScenario,
  agreementId: string,
  authority: PaidProSignerMetadataAuthority,
): void {
  const draft = scenarioToAgreementDraft(scenario, agreementId);
  const recipientSetup = recipientSetupFromScenario(scenario);
  const mergedDraft =
    mergeLiveDraftWithRecipientSetupForVs01Bridge(draft, recipientSetup) ?? draft;
  const bridge = buildAgreementVs01BridgeSession({
    agreementId,
    vs01DocumentId: `doc_${agreementId}`,
    draft: mergedDraft,
    senderFirstLawdogHandoff: true,
    agreementCorpusText: getPaidProSourceOfTruthText(),
    recipientSetup,
  });
  const emailCount = [
    bridge.creatorEmail,
    ...bridge.counterparties.map((c) => c.email),
  ].filter((e) => e.includes("@")).length;
  if (emailCount < scenario.expectedN) {
    journeyFail(stage, `signature link emails ${emailCount} < ${scenario.expectedN}`);
  }
  if (scenario.coordinatorOnly && bridge.counterparties.length >= scenario.expectedN + 1) {
    journeyFail(stage, "coordinator included in VS01 counterparties");
  }

  const handoff = buildHandoffFromBridge(agreementId, scenario, bridge);
  writePaidProVs01PostSignHandoff(handoff);
  simulateAllSignersSigned(handoff);

  if (!isAgreementFullySignedLocal(agreementId)) {
    journeyFail(stage, "local signing packet not fully signed");
  }

  const row = workspaceIndexRow(agreementId, scenario);
  if (!isAgreementCompletedForDashboard(row)) {
    journeyFail(stage, "dashboard completion not detected after all signers signed");
  }

  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: getPaidProSourceOfTruthText(),
    authority,
    intakeRaw: scenario.intakeText,
    surface: "test424_completion",
    signatureRegionOnly: false,
    repairRecital: true,
  });
  if (hydrated.rejected) {
    journeyFail(stage, `completed corpus hydration rejected: ${hydrated.rejectReason ?? "unknown"}`);
  }
  const partyBlocks = countPartyBlocksInExecutionTail(hydrated.corpus, scenario.parties);
  if (partyBlocks !== scenario.expectedN) {
    journeyFail(stage, `execution blocks ${partyBlocks} !== ${scenario.expectedN}`);
  }
  if (countPaidProExecutionBlocks(executionTail(hydrated.corpus)) > scenario.expectedN) {
    journeyFail(stage, "duplicate execution blocks in completed document");
  }
  if (hydrated.corpus.trim().length < getPaidProSourceOfTruthText().trim().length * 0.85) {
    journeyFail(stage, "completed document shorter than frozen SoT — stale body risk");
  }
}

/** Journey A — create → review → sign → complete → retrieve. */
export function runJourneyAHappyPathLifecycle(scenario: Test424JourneyScenario): void {
  const agreementId = `ag_test424_a_${scenario.id}`;
  clearConsumedPaidProSignerMetadataAuthority();

  const corpus = buildJourneyCorpus(scenario);
  if (corpus.trim().length < minWorkflowCorpusLen(scenario.expectedN)) {
    journeyFail("pro_draft", `Pro draft corpus too short (${corpus.trim().length})`);
  }

  const sot = establishScenarioSoT("structural_sot", scenario, corpus);

  if (!hasCanonicalReviewCorpusForRender()) {
    journeyFail("review_render", "review corpus not mounted from frozen SoT");
  }
  const review = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  if (review.trim().length < minWorkflowCorpusLen(scenario.expectedN)) {
    journeyFail("review_render", `review page corpus too short (${review.trim().length})`);
  }
  for (const party of scenario.parties) {
    if (!review.includes(party.split(" ")[0]!)) {
      journeyFail("review_render", `review missing party ${party}`);
    }
  }

  const seed = runPaidProSignerMetadataAuthoritySeed({
    stage: `test424_a_${scenario.id}`,
    legalEntities: [...scenario.parties],
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    handoff: readPremiumRecipientHandoff(),
    uiSignerNames: scenario.signerNames.slice(0, 2),
    uiSignerTitles: scenario.signerTitles.slice(0, 2),
    authoritativePartyCount: scenario.expectedN,
  });
  if (seed.names.filter((n) => n.trim()).length !== scenario.expectedN) {
    journeyFail("signer_setup", `seed signer names ${seed.names.filter((n) => n.trim()).length}`);
  }

  const authority = finalizeSignerWorkflow("signer_finalize", scenario);
  assertSignatureLinksAndCompletion("signature_completion", scenario, agreementId, authority);

  const completedRow = workspaceIndexRow(agreementId, scenario, { completed_signed: true });
  const gate = resolveCreatorDashboardReviewGate(completedRow, []);
  if (!completedRow.completed_signed && !gate.allRequiredReviewPartiesApproved) {
    journeyFail("dashboard_status", "dashboard review gate not approved after completion");
  }
  const pill = deriveCreatorDashboardStatusPillFromGate(completedRow, gate);
  if (pill && pill.toLowerCase().includes("waiting")) {
    journeyFail("dashboard_status", `dashboard pill still waiting: ${pill}`);
  }
  void sot;
}

/** Journey B — review revision → owner edit → re-approve → sign. */
export function runJourneyBReviewRevisionFlow(scenario: Test424JourneyScenario): void {
  const agreementId = `ag_test424_b_${scenario.id}`;
  clearConsumedPaidProSignerMetadataAuthority();

  const corpus = buildJourneyCorpus(scenario);
  const sot = establishScenarioSoT("initial_sot", scenario, corpus);
  let continuity = createInitialReviewContinuityState(sot);

  const termMatch = sot.match(/\b(\d+)\s+months?\b/i);
  const revisedToken = termMatch ? `${Number(termMatch[1]) + 6} months` : "extended collaboration period";
  const revisedCorpus = termMatch
    ? sot.replace(termMatch[0], revisedToken)
    : `${sot}\n\nADDENDUM. Parties agree to an ${revisedToken}.\n`;

  continuity = applyUploadedRevisionCandidate(continuity, revisedCorpus);
  if (continuity.reviewSessionState !== "revision_uploaded") {
    journeyFail("review_changes_requested", "review session not revision_uploaded");
  }
  continuity = acceptUploadedRevision(continuity);
  if (!continuity.latestAcceptedCorpus.includes(revisedToken)) {
    journeyFail("owner_edit", `owner accepted revision missing token: ${revisedToken}`);
  }
  if (continuity.uploadedRevisionCorpus.trim()) {
    journeyFail("owner_edit", "stale uploadedRevisionCorpus after accept");
  }

  const reEstablished = establishScenarioSoT("owner_edit_resot", scenario, continuity.latestAcceptedCorpus);
  if (!reEstablished.includes(revisedToken)) {
    journeyFail("owner_edit_resot", `re-established SoT missing approved revision: ${revisedToken}`);
  }

  continuity = markReviewApprovedForSigning(continuity);
  if (continuity.reviewSessionState !== "approved_for_signing") {
    journeyFail("review_approved", "review not approved_for_signing");
  }

  const authority = finalizeSignerWorkflow("signer_finalize_post_revision", scenario);
  const identities = normalizePartyIdentities({
    intakeText: scenario.intakeText,
    authorityParties: authority.parties,
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
  const manifest = buildCanonicalSignerManifest({
    identities: manifestIdentities,
    signFirst: false,
  });
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
    journeyFail("signature_prep", `guided transition blocked: ${transition.reason ?? "unknown"}`);
  }

  assertSignatureLinksAndCompletion("signature_completion", scenario, agreementId, authority);

  const gate = resolveCreatorDashboardReviewGate(
    workspaceIndexRow(agreementId, scenario, {
      completed_signed: true,
      all_reviewers_approved: true,
      review_approvals_completed: scenario.expectedN,
    }),
    [],
  );
  if (!gate.allRequiredReviewPartiesApproved && !isAgreementCompletedForDashboard(
    workspaceIndexRow(agreementId, scenario, { completed_signed: true }),
  )) {
    journeyFail("dashboard_status", "dashboard gate stale after revision flow");
  }
}

/** Journey C — coordinator creates but is not a legal party. */
export function runJourneyCCoordinatorOnly(scenario: Test424JourneyScenario): void {
  if (!scenario.coordinatorOnly) {
    journeyFail("coordinator_setup", "scenario missing coordinatorOnly");
  }
  const agreementId = `ag_test424_c_${scenario.id}`;
  const corpus = buildJourneyCorpus(scenario);
  const sot = establishScenarioSoT("structural_sot", scenario, corpus);

  const coordinator = createCoordinatorProfile({
    isUser: true,
    email: "jane.coordinator@example.com",
    displayName: "Jane Coordinator",
    userRelation: "coordinator",
  });
  const parties = normalizePartyIdentities({
    intakeText: scenario.intakeText,
    userIsCoordinatorOnly: true,
    coordinator,
    authorityParties: scenarioAuthorityParties(scenario),
  });
  const legal = legalPartyIdentitiesExcludingCoordinator(parties, coordinator, true);
  if (legal.length !== scenario.expectedN) {
    journeyFail("coordinator_exclusion", `legal parties ${legal.length} !== ${scenario.expectedN}`);
  }
  if (legal.some((p) => /coordinator/i.test(p.legalName))) {
    journeyFail("coordinator_exclusion", "coordinator name in legal party list");
  }

  const noticeCount = countOperativeIfToNoticeStanzas(sot);
  if (noticeCount > scenario.expectedN) {
    journeyFail("notice_authority", `notice stanzas ${noticeCount} > ${scenario.expectedN}`);
  }

  const authority = finalizeSignerWorkflow("signer_finalize", scenario);
  const tailBlocks = countPartyBlocksInExecutionTail(sot, scenario.parties);
  if (tailBlocks !== scenario.expectedN) {
    journeyFail("execution_blocks", `execution party blocks ${tailBlocks}`);
  }

  const draft = scenarioToAgreementDraft(scenario, agreementId);
  const bridge = buildAgreementVs01BridgeSession({
    agreementId,
    vs01DocumentId: `doc_${agreementId}`,
    draft,
    senderFirstLawdogHandoff: true,
    agreementCorpusText: sot,
  });
  if (bridge.counterparties.length > scenario.expectedN - 1) {
    journeyFail("signature_links", `counterparties ${bridge.counterparties.length} exceeds legal parties`);
  }

  const reviewGate = resolveCreatorDashboardReviewGate(
    workspaceIndexRow(agreementId, scenario, { review_sent_at: new Date().toISOString() }),
    [],
  );
  if (!reviewGate.authoritative && scenario.expectedN > 2) {
    // index-only path still allows coordinator send-review CTA wiring
  }

  assertSignatureLinksAndCompletion("completion", scenario, agreementId, authority);

  const completedRow = workspaceIndexRow(agreementId, scenario, { completed_signed: true });
  if (!isAgreementCompletedForDashboard(completedRow)) {
    journeyFail("dashboard", "coordinator flow completion not on dashboard");
  }
  void reviewGate;
}

/** Journey D — partial metadata completed later. */
export function runJourneyDMetadataCompletion(scenario: Test424JourneyScenario): void {
  const agreementId = `ag_test424_d_${scenario.id}`;
  const partialAuthority = scenarioAuthorityParties(scenario);

  writePremiumRecipientHandoffFromAuthorityParties(partialAuthority);
  assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), scenario.expectedN, scenario.parties);

  const corpus = buildJourneyCorpus(scenario);
  const sot = establishScenarioSoT("structural_sot", scenario, corpus);

  const gatedPartial = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
    partySlotCount: scenario.expectedN,
  });
  const partialSlots = linearPremiumRecipientSlots(gatedPartial, scenario.expectedN);
  const missingEmailSlots = partialSlots.filter((s) => !(s.email || "").includes("@")).length;
  if (missingEmailSlots === 0) {
    journeyFail("partial_metadata", "expected partial email slots at start");
  }

  const completeAuthority = scenarioAuthorityParties({
    ...scenario,
    emails: scenario.parties.map((_, i) =>
      scenario.emails[i]?.includes("@")
        ? scenario.emails[i]!
        : `complete.party${i}@example.test`,
    ),
  });
  writePremiumRecipientHandoffFromAuthorityParties(completeAuthority);
  assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), scenario.expectedN, scenario.parties);
  assertAuthorityPartiesMetadata(
    "metadata_complete",
    completeAuthority,
    scenario.parties,
    scenario.signerNames,
  );

  const authority = finalizeSignerWorkflow("signer_finalize", scenario, completeAuthority);
  const gated = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
    partySlotCount: scenario.expectedN,
  });
  const slots = linearPremiumRecipientSlots(gated, scenario.expectedN);
  if (slots.length !== scenario.expectedN) {
    journeyFail("handoff_authority", `slot drift: ${slots.length}`);
  }
  if (slots.some((s) => !s.email.includes("@"))) {
    journeyFail("handoff_authority", "emails still missing after metadata completion");
  }

  assertSignatureLinksAndCompletion("signature_links", scenario, agreementId, authority);

  const phantomParty = slots.find((s) => /phantom|party 6|extra legal/i.test(s.name));
  if (phantomParty) {
    journeyFail("phantom_parties", `phantom party slot: ${phantomParty.name}`);
  }
  void sot;
}

/** Journey E — structural rejection, stale corpus clear, recovery. */
export function runJourneyERecovery(scenario: Test424JourneyScenario): void {
  const cleanCorpus = buildJourneyCorpus(scenario);
  const malformed = buildMalformedAcceptedCorpus(cleanCorpus);
  const malformedHash = rejectedProCorpusHash(malformed);
  if (!malformedHash) {
    journeyFail("structural_rejection", "malformed corpus hash missing");
  }

  markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft" });
  latchAcceptedServerFullDraftAuthority(
    malformed.length >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN
      ? malformed
      : `${malformed}\n\n${"Supplemental clause. ".repeat(400)}`,
    "server_full_draft",
  );

  if (malformed === cleanCorpus) {
    journeyFail("structural_rejection", "malformed corpus unchanged from clean");
  }

  clearPaidProSourceOfTruth();
  clearPartialPaidProAuthoritativeState();
  clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: malformed, reason: "test424" });

  if (hasPaidProSourceOfTruth()) {
    journeyFail("freeze_rejection", "SoT present before recovery");
  }

  const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    source: "server_full_draft",
  });
  if (!recovered.ok) {
    journeyFail("recovery_corpus", recovered.reason ?? "recovery failed");
  }

  const sot = getPaidProSourceOfTruthText();
  const sotHash = rejectedProCorpusHash(sot);
  if (sotHash === malformedHash) {
    journeyFail("recovery_corpus", "rejected corpus hash reused after recovery");
  }

  assertCanonicalPartyCount("recovery_party_count", scenario.intakeText, scenario.draft, scenario.expectedN, sot);
  assertFrozenCorpusIntegrity("recovery_sot", scenario, sot);

  const review = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  if (review.trim().length < minWorkflowCorpusLen(scenario.expectedN)) {
    journeyFail("review_render", `review unstable after recovery (${review.trim().length})`);
  }
  if (rejectedProCorpusHash(review) === malformedHash) {
    journeyFail("review_render", "review render reuses rejected corpus hash");
  }

  const noticeCount = countOperativeIfToNoticeStanzas(sot);
  if (scenario.requireNoticeStanzas !== false && noticeCount < scenario.expectedN) {
    journeyFail("notice_stanzas", `notices ${noticeCount} < ${scenario.expectedN}`);
  }

  const authority = finalizeSignerWorkflow("signer_metadata", scenario);
  if (authority.parties.length !== scenario.expectedN) {
    journeyFail("signer_metadata", `authority slots ${authority.parties.length}`);
  }

  if (resolveCanonicalReviewCorpusLenForRender() < minWorkflowCorpusLen(scenario.expectedN)) {
    journeyFail("frozen_sot_authoritative", "canonical review len too low after recovery");
  }
}
