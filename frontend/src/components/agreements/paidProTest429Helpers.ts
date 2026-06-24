/**
 * TEST429 — historical regression assertion runners.
 */

import type { WorkspaceIndexAgreement } from "../../agreement/agreementWorkspaceApi";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { isAgreementCompletedForDashboard } from "../../launch/creatorDashboardAgreementCompletion";
import {
  createCoordinatorProfile,
  legalPartyIdentitiesExcludingCoordinator,
  normalizePartyIdentities,
} from "./canonicalPartyIdentityModel";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { evaluateProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import { resolvePaidProReviewBranchPath } from "./paidProReviewBranchInstrumentation";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { beginPaidProPostFinalizeSignerDetailsReopen } from "./paidProPostFinalizeEditSignerDetails";
import { setPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToLiveSignerMetadataUi,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  evaluatePaidProCorpusSoTFreezeCompatibility,
  hasFrozenPaidProAuthoritativeSnapshot,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import { clearStaleAcceptedButUnfrozenProCorpus, rejectedProCorpusHash } from "./paidProStaleAcceptedUnfrozenCorpus";
import { latchAcceptedServerFullDraftAuthority, LONG_PREMIUM_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  assertCanonicalPartyCount,
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import { buildMalformedAcceptedCorpus } from "./paidProTest424Fixtures";
import {
  buildTest427Corpus,
  scenarioAuthorityParties427,
  TEST427_FORBIDDEN_ENTITY_MARKERS,
  TEST427_SCENARIOS,
  type Test427Scenario,
} from "./paidProTest427Fixtures";
import { runTest427ProductionWorkflow } from "./paidProTest427JourneyHelpers";
import {
  assertTest428SectionFormatting,
  assertTest428SignerHydration,
  assertTest428StickyCta,
  prepareTest428UxContext,
  type Test428UxContext,
} from "./paidProTest428UxHelpers";
import {
  buildTest429SplitClientMaterialsCorpus,
  type Test429Case,
  type Test429InvariantKey,
} from "./paidProTest429HistoricalRegressionFixtures";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";

export type Test429Context = Test428UxContext & {
  case: Test429Case;
  correctedParty1Email?: string;
};

export type Test429MatrixRow = {
  id: string;
  historicalFailure: string;
  historicalRef: string;
  fixtureType: string;
  partyCount: number;
  pass: boolean;
  reason: string | null;
};

export const TEST429_MATRIX_RESULTS: Test429MatrixRow[] = [];

export class Test429InvariantError extends Error {
  readonly invariant: Test429InvariantKey;

  constructor(invariant: Test429InvariantKey, message: string) {
    super(message);
    this.name = "Test429InvariantError";
    this.invariant = invariant;
  }
}

function fail429(invariant: Test429InvariantKey, message: string): void {
  throw new Test429InvariantError(invariant, message);
}

function resolveScenario(scenarioId: string): Test427Scenario {
  const scenario = TEST427_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`TEST429 missing scenario ${scenarioId}`);
  }
  return scenario;
}

function minReviewLen(n: number): number {
  return Math.max(2000, n * 650);
}

function completeAuthorityParties(scenario: Test427Scenario): PaidProSignerMetadataParty[] {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail:
      scenario.emails[partyIndex]?.includes("@")
        ? scenario.emails[partyIndex]!
        : `complete.party${partyIndex}@genesisdog429.example.com`,
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

function buildJourneyCorpus(scenario: Test427Scenario): string {
  return padOperativeCorpusBeforeWitness(
    buildTest427Corpus(scenario),
    Math.max(5200, scenario.expectedN * 900),
  );
}

function finalizeSignerMetadata429(
  scenario: Test427Scenario,
  authority: PaidProSignerMetadataAuthority,
): string {
  const rawCorpus = resolvePaidProSignerFinalizeRawCorpus({
    immutableSourceOfTruthOnly: true,
  }).corpus;
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus,
    authority,
    intakeRaw: scenario.intakeText,
    surface: "test429_finalize",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  if (hydrated.rejected) {
    fail429("signer_edit_carryover", hydrated.rejectReason ?? "finalize hydration rejected");
  }
  const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  setConsumedPaidProSignerMetadataAuthority(authority);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata,
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    replaceExisting: true,
  });
  setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
  return hydrated.corpus;
}

function establishTest429Recovery(scenario: Test427Scenario): void {
  const cleanCorpus = buildJourneyCorpus(scenario);
  const malformed = buildMalformedAcceptedCorpus(cleanCorpus);
  const malformedHash = rejectedProCorpusHash(malformed);
  if (!malformedHash) {
    fail429("recovery_frozen_sot", "malformed corpus hash missing");
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
      fail429("recovery_frozen_sot", "malformed corpus established SoT without rejection");
    }
  } catch {
    /* expected for structural/freeze rejection */
  }

  if (hasPaidProSourceOfTruth() && scenario.recoveryMode !== "stale_accepted") {
    fail429("recovery_frozen_sot", "SoT present after rejection");
  }

  if (scenario.recoveryMode === "stale_accepted" || scenario.recoveryMode === "freeze_rejection") {
    clearStaleAcceptedButUnfrozenProCorpus({ rejectedCorpusText: malformed, reason: "test429" });
  }

  const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    source: "server_full_draft",
  });
  if (!recovered.ok) {
    fail429("recovery_frozen_sot", recovered.reason ?? "recovery failed");
  }

  const sot = getPaidProSourceOfTruthText();
  if (rejectedProCorpusHash(sot) === malformedHash) {
    fail429("recovery_frozen_sot", "rejected corpus hash reused");
  }
  assertCanonicalPartyCount("test429_recovery", scenario.intakeText, scenario.draft, scenario.expectedN, sot);
}

function buildSignerEditContext(testCase: Test429Case): Test429Context {
  const scenario = resolveScenario(testCase.scenarioId);
  const base = prepareTest428UxContext(scenario);
  const parties = completeAuthorityParties(scenario);
  const ui = authorityPartiesToLiveSignerMetadataUi(
    parties.map((p) => ({
      partyIndex: p.partyIndex,
      partyLegalName: p.partyLegalName,
      signerEmail: p.signerEmail,
      signerName: p.signerName,
      signerTitle: p.signerTitle,
      partyAddress: p.partyAddress,
    })),
  );
  const authority = buildPaidProSignerMetadataAuthorityForFinalize(ui, {
    intakeText: scenario.intakeText,
    draftPartyNames: scenario.parties.slice(0, 2) as string[],
  });
  finalizeSignerMetadata429(scenario, authority);
  beginPaidProPostFinalizeSignerDetailsReopen();

  const correctedUi = authorityPartiesToLiveSignerMetadataUi(authority.parties);
  const correctedEmail = `corrected.${scenario.id}@example.test`;
  correctedUi.recipient1Email = correctedEmail;
  const correctedAuthority = buildPaidProSignerMetadataAuthorityForFinalize(correctedUi, {
    intakeText: scenario.intakeText,
    draftPartyNames: scenario.parties.slice(0, 2) as string[],
  });
  finalizeSignerMetadata429(scenario, correctedAuthority);

  const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
  return {
    ...base,
    reviewPlain,
    case: testCase,
    correctedParty1Email: correctedEmail,
  };
}

function buildDuplicateWitnessContext(testCase: Test429Case): Test429Context {
  const scenario = resolveScenario(testCase.scenarioId);
  const corpus = buildJourneyCorpus(scenario);
  const duplicateTail = [
    "",
    "IN WITNESS WHEREOF, the parties execute this duplicate tail.",
    `PARTY A: ${scenario.parties[0]}`,
    "By: _________________________________",
    "",
    `PARTY B: ${scenario.parties[1] ?? "Second Party LLC"}`,
    "By: _________________________________",
  ].join("\n");
  const dupCorpus = `${corpus}\n${duplicateTail}`;
  const prep = preparePaidProServerDocumentForAcceptance(dupCorpus, scenario.draft, scenario.intakeText);
  const accepted = padOperativeCorpusBeforeWitness(prep.text, 2000);
  markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });
  establishPaidProSourceOfTruth({
    text: accepted,
    source: "server_full_draft",
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  const sot = getPaidProSourceOfTruthText();
  const reviewPlain = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  return { scenario, sot, reviewPlain, case: testCase };
}

function workspaceRow(
  scenario: Test427Scenario,
  overrides: Partial<WorkspaceIndexAgreement> = {},
): WorkspaceIndexAgreement {
  return {
    id: `ag_test429_${scenario.id}`,
    title: scenario.draft.title ?? "Agreement",
    updated_at: new Date().toISOString(),
    party_count: scenario.expectedN,
    signer_count: scenario.expectedN,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: new Date().toISOString(),
    reviewer_approved: false,
    all_reviewers_approved: false,
    review_approvals_required: scenario.expectedN,
    review_approvals_completed: 0,
    ...overrides,
  };
}

export function buildTest429Context(testCase: Test429Case): Test429Context {
  const scenario = resolveScenario(testCase.scenarioId);

  if (testCase.setupKind === "full_workflow") {
    clearAuthoritativeSigningSnapshot();
    runTest427ProductionWorkflow(scenario);
    const sot = getPaidProSourceOfTruthText();
    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    });
    return { scenario, sot, reviewPlain, case: testCase };
  }

  if (testCase.setupKind === "signer_edit") {
    return buildSignerEditContext(testCase);
  }

  if (testCase.setupKind === "recovery_structural" || testCase.setupKind === "recovery_stale") {
    establishTest429Recovery(scenario);
    const sot = getPaidProSourceOfTruthText();
    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    });
    return { scenario, sot, reviewPlain, case: testCase };
  }

  if (testCase.setupKind === "duplicate_witness") {
    return buildDuplicateWitnessContext(testCase);
  }

  if (testCase.setupKind === "glued_client_materials") {
    const split = buildTest429SplitClientMaterialsCorpus();
    const { text, repairs } = repairSplitPaidProHeadingFragments(split);
    if (repairs.length === 0) {
      fail429("client_materials_heading_merged", "split corpus repair produced no repairs");
    }
    return { scenario, sot: text, reviewPlain: text, case: testCase };
  }

  if (testCase.setupKind === "malformed_freeze_gate" || testCase.setupKind === "starter_gate_only") {
    return { scenario, sot: "", reviewPlain: "", case: testCase };
  }

  return { ...prepareTest428UxContext(scenario), case: testCase };
}

function assertInvariant(ctx: Test429Context, key: Test429InvariantKey): void {
  const { scenario, sot, reviewPlain, case: testCase } = ctx;

  switch (key) {
    case "review_mounted_non_thin":
      if (!hasCanonicalReviewCorpusForRender()) {
        fail429(key, "canonical review corpus not mounted");
      }
      const len = resolveCanonicalReviewCorpusLenForRender();
      if (len < minReviewLen(scenario.expectedN)) {
        fail429(key, `review corpus too short (${len})`);
      }
      if (reviewPlain.trim().length < minReviewLen(scenario.expectedN)) {
        fail429(key, "review render blank or thin");
      }
      break;

    case "no_blank_pro_shell":
      if (hasPaidProSourceOfTruth() && sot.trim().length < 500) {
        fail429(key, "SoT too thin for Pro shell");
      }
      if (reviewPlain.trim().length > 0 && reviewPlain.trim().length < 500) {
        fail429(key, "review plain too thin — blank shell risk");
      }
      const branch = resolvePaidProReviewBranchPath({
        premiumPaidDocumentSurface: true,
        showPaidProReviewDocumentCard: hasCanonicalReviewCorpusForRender(),
        proUpgradeUseStarterView: false,
        paidProForcedFirstReviewActive: true,
        guidedPreReviewSignerSetupActive: false,
        paidProAwaitingRuntimeAuthority: false,
        simpleProFinalReviewShellActive: false,
        failedPremiumCorpusActive: false,
        premiumReturnWaitActive: false,
      });
      if (branch.path === "blocked_can_display" && hasCanonicalReviewCorpusForRender()) {
        fail429(key, `review blocked with corpus mounted: ${branch.reason ?? ""}`);
      }
      break;

    case "single_execution_block":
      const execCount = countPaidProExecutionBlocks(reviewPlain.length > 0 ? reviewPlain : sot);
      if (execCount !== 1) {
        fail429(key, `expected 1 execution block, got ${execCount}`);
      }
      break;

    case "single_witness":
      const witnessCount = (sot.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length;
      if (witnessCount !== 1) {
        fail429(key, `expected 1 witness region, got ${witnessCount}`);
      }
      break;

    case "no_malformed_headings":
      assertTest428SectionFormatting(ctx);
      break;

    case "full_legal_entity_names":
      for (const party of scenario.parties) {
        const corpus = reviewPlain.length > 0 ? reviewPlain : sot;
        if (!corpus.toLowerCase().includes(party.toLowerCase().replace(/\.$/, ""))) {
          fail429(key, `missing full legal name: ${party}`);
        }
      }
      break;

    case "human_signer_names":
      assertTest428SignerHydration(ctx);
      break;

    case "metadata_fields_preserved":
      assertTest428SignerHydration(ctx);
      break;

    case "notices_match_parties":
      const noticeCount = countOperativeIfToNoticeStanzas(sot);
      if (noticeCount > scenario.expectedN) {
        fail429(key, `notice stanzas ${noticeCount} > parties ${scenario.expectedN}`);
      }
      if (scenario.requireNoticeStanzas !== false && noticeCount < scenario.expectedN) {
        fail429(key, `notice stanzas ${noticeCount} < parties ${scenario.expectedN}`);
      }
      break;

    case "review_sot_parity":
      const parity = auditPaidProReviewRenderSotParity({
        reviewPlain,
        surface: `test429_${testCase.id}`,
        intakeText: scenario.intakeText,
        draft: scenario.draft,
      });
      if (parity.blankSignerLinesRemaining > 0) {
        fail429(key, `blank signer lines ${parity.blankSignerLinesRemaining}`);
      }
      if (!parity.invariantOk && !parity.signerFieldOnlyDelta) {
        fail429(key, "review/SoT parity invariant failed");
      }
      break;

    case "dashboard_completion": {
      const rowDone = workspaceRow(scenario, {
        completed_signed: true,
        review_approvals_completed: scenario.expectedN,
      });
      if (!isAgreementCompletedForDashboard(rowDone)) {
        fail429(key, "dashboard completion not detected");
      }
      break;
    }

    case "stale_corpus_cleared":
      if (!hasCanonicalReviewCorpusForRender() && !hasPaidProSourceOfTruth()) {
        break;
      }
      if (hasFrozenPaidProAuthoritativeSnapshot() && !hasPaidProSourceOfTruth()) {
        fail429(key, "frozen snapshot without SoT after stale clear");
      }
      break;

    case "recovery_frozen_sot":
      if (!hasPaidProSourceOfTruth()) {
        fail429(key, "SoT missing after recovery");
      }
      if (!hasFrozenPaidProAuthoritativeSnapshot()) {
        fail429(key, "frozen authoritative snapshot missing after recovery");
      }
      if (sot.trim().length < minReviewLen(scenario.expectedN)) {
        fail429(key, "recovered SoT too thin");
      }
      break;

    case "no_fixture_contamination":
      const upper = (reviewPlain + sot).toUpperCase();
      for (const marker of TEST427_FORBIDDEN_ENTITY_MARKERS) {
        if (upper.includes(marker)) {
          fail429(key, `contamination marker: ${marker}`);
        }
      }
      const contamination = evaluateProfessionalCorpusContamination(sot, {
        partyNames: scenario.parties,
        partyCount: scenario.expectedN,
        intakeText: scenario.intakeText,
        signerNames: scenario.signerNames,
      });
      if (!contamination.ok) {
        fail429(key, contamination.issues.map((i) => i.code).join("; "));
      }
      break;

    case "coordinator_excluded":
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
        fail429(key, `legal parties ${legal.length} !== ${scenario.expectedN}`);
      }
      if (legal.some((p) => /coordinator|paige orchestrator/i.test(p.legalName))) {
        fail429(key, "coordinator in legal party list");
      }
      break;

    case "partial_slots_preserve_known":
      const partialParties = scenarioAuthorityParties427(scenario);
      writePremiumRecipientHandoffFromAuthorityParties(partialParties);
      const handoff = readPremiumRecipientHandoff();
      const slots = linearPremiumRecipientSlots(handoff, scenario.expectedN);
      if (slots.length !== scenario.expectedN) {
        fail429(key, `handoff slots ${slots.length}`);
      }
      for (let i = 0; i < scenario.expectedN; i++) {
        const knownEmail = scenario.emails[i];
        if (knownEmail?.includes("@") && slots[i]!.email !== knownEmail) {
          fail429(key, `known email drift slot ${i}`);
        }
        const knownName = scenario.signerNames[i]?.trim();
        if (knownName && knownName.length >= 2 && slots[i]!.signerName !== knownName) {
          fail429(key, `known signer name drift slot ${i}`);
        }
        const knownTitle = scenario.signerTitles[i]?.trim();
        if (knownTitle && knownTitle.length >= 2 && slots[i]!.signerTitle !== knownTitle) {
          fail429(key, `known title drift slot ${i}`);
        }
      }
      break;

    case "starter_complexity_gate": {
      const starterGate = assessStarterComplexityGate(scenario.intakeText);
      if (!starterGate.required) {
        fail429(key, "starter gate should require Pro for this intake");
      }
      if (starterGate.partyCount < scenario.expectedN && scenario.expectedN >= 3) {
        fail429(key, `gate party count ${starterGate.partyCount} < ${scenario.expectedN}`);
      }
      if (hasPaidProSourceOfTruth()) {
        fail429(key, "Pro SoT established before entitlement — premature Pro shell");
      }
      break;
    }

    case "signer_edit_carryover":
      if (!ctx.correctedParty1Email) {
        fail429(key, "missing corrected email in signer edit context");
      }
      const emailRe = new RegExp(ctx.correctedParty1Email!.replace(/\./g, "\\."));
      if (!reviewPlain.match(emailRe)) {
        fail429(key, "corrected Party 1 email not in review plain");
      }
      const editParity = auditPaidProReviewRenderSotParity({
        reviewPlain,
        surface: `test429_${testCase.id}`,
        intakeText: scenario.intakeText,
        draft: scenario.draft,
      });
      if (editParity.blankSignerLinesRemaining > 0) {
        fail429(key, `blank signer lines ${editParity.blankSignerLinesRemaining}`);
      }
      break;

    case "client_materials_heading_merged":
      if (sot.match(/\nClient Materials\n/)) {
        fail429(key, "split Client Materials fragment remains");
      }
      if (!sot.includes("5. Ownership, Work Product and Client Materials")) {
        fail429(key, "merged Client Materials heading missing");
      }
      break;

    case "freeze_rejects_bad_corpus":
      const badCorpus = buildJourneyCorpus(scenario).replace(
        /^\d+\.\s+NOTICES\s*$/gim,
        "10. COMMUNICATIONS",
      );
      const compat = evaluatePaidProCorpusSoTFreezeCompatibility(badCorpus, {
        draft: scenario.draft,
        intakeText: scenario.intakeText,
        draftPartyCount: scenario.expectedN,
        source: "test429_malformed",
      });
      if (compat.ok) {
        fail429(key, "malformed corpus passed freeze compatibility");
      }
      break;

    case "sticky_cta_spacer":
      assertTest428StickyCta(ctx);
      break;

    case "signer_setup_latch_timing":
      const firstReview = resolvePaidProReviewBranchPath({
        premiumPaidDocumentSurface: true,
        showPaidProReviewDocumentCard: true,
        proUpgradeUseStarterView: false,
        paidProForcedFirstReviewActive: true,
        guidedPreReviewSignerSetupActive: false,
        paidProAwaitingRuntimeAuthority: false,
        simpleProFinalReviewShellActive: false,
        failedPremiumCorpusActive: false,
        premiumReturnWaitActive: false,
      });
      if (firstReview.path.includes("signer_setup") || firstReview.path.includes("guided_pre_review_signer")) {
        fail429(key, "signer setup shown on first review");
      }
      const earlyCta = resolvePaidProStickyCta({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      });
      if (earlyCta.label === PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA && earlyCta.showStickyBar) {
        fail429(key, "sticky signer CTA before latch");
      }
      break;

    case "no_truncated_party_render":
      for (const party of scenario.parties) {
        if (party.length > 20 && !reviewPlain.includes(party)) {
          const short = party.split(" ")[0]!;
          if (reviewPlain.includes(short) && !reviewPlain.includes(party)) {
            fail429(key, `truncated party name: ${party}`);
          }
        }
      }
      break;

    case "party_count_authority_stable":
      assertCanonicalPartyCount(
        `test429_${testCase.id}`,
        scenario.intakeText,
        scenario.draft,
        scenario.expectedN,
        sot,
      );
      const manifest = readFrozenCanonicalManifestPartyCount();
      if (manifest !== scenario.expectedN) {
        fail429(key, `manifest count ${manifest} !== ${scenario.expectedN}`);
      }
      break;

    case "completed_n_execution_blocks":
      assertTest428SignerHydration(ctx);
      const blocks = countPartyBlocksInExecutionTail(sot, scenario.parties);
      if (blocks !== scenario.expectedN) {
        fail429(key, `execution party blocks ${blocks} !== ${scenario.expectedN}`);
      }
      if (countPaidProExecutionBlocks(executionTail(sot)) > scenario.expectedN) {
        fail429(key, "duplicate collapsed execution blocks");
      }
      break;

    case "no_recovery_quad_bias":
      const biasMarkers = ["RED MESA", "BLUE CANYON", "MUTUAL CONSULTING", "HARBOR PEAK"];
      const recoveryUpper = sot.toUpperCase();
      for (const m of biasMarkers) {
        if (recoveryUpper.includes(m)) {
          fail429(key, `recovery biased to ${m}`);
        }
      }
      for (const party of scenario.parties) {
        if (!sot.includes(party.split(" ")[0]!)) {
          fail429(key, `recovery missing scenario party ${party}`);
        }
      }
      break;

    case "vs01_bridge_ready":
      if (!hasPaidProSourceOfTruth()) {
        fail429(key, "SoT missing after workflow");
      }
      if (sot.trim().length < minReviewLen(scenario.expectedN)) {
        fail429(key, "workflow SoT too thin");
      }
      break;

    default:
      fail429(key, `unknown invariant ${key}`);
  }
}

export function runTest429Case(testCase: Test429Case): void {
  const ctx = buildTest429Context(testCase);
  for (const invariant of testCase.invariantKeys) {
    assertInvariant(ctx, invariant);
  }
}

export function runTest429Cell(testCase: Test429Case): Test429MatrixRow {
  const row: Test429MatrixRow = {
    id: testCase.id,
    historicalFailure: testCase.historicalFailure,
    historicalRef: testCase.historicalRef,
    fixtureType: testCase.fixtureType,
    partyCount: testCase.partyCount,
    pass: false,
    reason: null,
  };
  try {
    runTest429Case(testCase);
    row.pass = true;
  } catch (err) {
    row.pass = false;
    row.reason =
      err instanceof Test429InvariantError
        ? `${err.invariant}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
  }
  TEST429_MATRIX_RESULTS.push(row);
  return row;
}

export function formatTest429Matrix(): string {
  const header = "failureClass | fixtureType | parties | PASS/FAIL";
  const lines = TEST429_MATRIX_RESULTS.map((r) => {
    const status = r.pass ? "PASS" : "FAIL";
    const fail = r.reason ? ` (${r.reason})` : "";
    return `${r.historicalRef}/${r.id} | ${r.fixtureType} | ${r.partyCount} | ${status}${fail}`;
  });
  return [header, ...lines].join("\n");
}
