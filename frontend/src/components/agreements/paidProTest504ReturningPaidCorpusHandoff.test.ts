/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowAuthoritativeReviewPlain,
  shouldBlockFreeStarterReviewSurfaces,
  shouldUseStarterDocumentPaperSurfaceOnCreateFlow,
} from "./authoritativeCreateFlowReviewShell";
import {
  ACCEPTED_PAID_PRO_CORPUS_HANDOFF_HELPER,
  CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER,
  commitAcceptedPaidProCorpusHandoffSync,
  planCanonicalPaidProSignerHandoff,
  planEnterCanonicalPaidProReviewFlow,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import {
  markPaidProPipelineAcceptedCorpusHash,
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusBody,
} from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import {
  GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN,
  resolveSimpleProFinalReviewCorpus,
} from "./simpleProFinalReviewCorpus";
import { CreateUiStage } from "./createUiStage";
import {
  TEST504_ACCEPTED_PAID_BODY,
  TEST504_INTAKE,
  TEST504_LIVE_FREEZE_HASH_REFERENCE,
  TEST504_PREPARED_FREEZE_CANDIDATE_HASH,
  TEST504_RECIPIENT_CANDIDATES,
  TEST504_STARTER_PREVIEW,
  test504Draft,
} from "./paidProTest504Fixtures";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

function simulatePipelineAcceptanceWithoutReactRefs(): void {
  markPaidProPipelineValidationPassed({
    text: TEST504_ACCEPTED_PAID_BODY,
    source: "server_full_draft",
  });
  markPaidProPipelineAcceptedCorpusHash(TEST504_ACCEPTED_PAID_BODY);
}

describe("TEST504 — returning paid corpus handoff promotes accepted Pro body before final review", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(true);
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    vi.restoreAllMocks();
  });

  it("1 — pipeline acceptance stores concise accepted body for resolver handoff", () => {
    simulatePipelineAcceptanceWithoutReactRefs();
    expect(TEST504_ACCEPTED_PAID_BODY.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(TEST504_PREPARED_FREEZE_CANDIDATE_HASH).toMatch(/^1797:[0-9a-f]+$/);
    expect(TEST504_LIVE_FREEZE_HASH_REFERENCE).toMatch(/^1797:/);
    expect(readPaidProPipelineAcceptedCorpusBody()).toBe(TEST504_ACCEPTED_PAID_BODY);
    expect(paidProPipelineAcceptedCorpusHash(TEST504_ACCEPTED_PAID_BODY)).toBe(
      TEST504_PREPARED_FREEZE_CANDIDATE_HASH,
    );
  });

  it("2 — final review authoritative body resolves from pipeline acceptance without React refs", () => {
    simulatePipelineAcceptanceWithoutReactRefs();
    const draft = test504Draft(TEST504_STARTER_PREVIEW, TEST504_ACCEPTED_PAID_BODY);
    const authoritativePlain = resolveCreateFlowAuthoritativeReviewPlain({
      agreementDocumentText: TEST504_STARTER_PREVIEW,
      draft,
      pipelineWinningBody: "",
      hydratedPremiumBody: "",
    });
    expect(authoritativePlain.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(authoritativePlain).toContain("Red Mesa Logistics LLC");
    expect(authoritativePlain).toBe(TEST504_ACCEPTED_PAID_BODY);
    expect(readPaidProPipelineAcceptedCorpusBody()).toBe(TEST504_ACCEPTED_PAID_BODY);
  });

  it("3 — SimpleProFinalReviewScreen corpus is substantive and not empty_authoritative_body", () => {
    simulatePipelineAcceptanceWithoutReactRefs();
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      renderedPreviewPlain: TEST504_STARTER_PREVIEW,
      pickerPlain: TEST504_STARTER_PREVIEW,
      agreementDocumentPlain: TEST504_STARTER_PREVIEW,
      pipelineWinningPlain: "",
      finalReviewAuthorityOnly: true,
    });
    expect(corpus.plainText.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(corpus.authoritativeLen).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(corpus.plainText).not.toBe(TEST504_STARTER_PREVIEW);
  });

  it("4 — paid review shell wins; starter_document_surface and conversion UI blocked", () => {
    simulatePipelineAcceptanceWithoutReactRefs();
    const shellInput = {
      workspaceProEntitled: true,
      premiumPersistedFlowActive: true,
      premiumSendPathUnlocked: true,
    };
    expect(resolveAuthoritativeCreateFlowReviewShell(shellInput)).toBe("paid_pro");
    expect(shouldBlockFreeStarterReviewSurfaces(shellInput)).toBe(true);
    expect(
      shouldUseStarterDocumentPaperSurfaceOnCreateFlow({
        shellInput,
        isFreeStreamlineDraftReview: true,
        createUiStage: CreateUiStage.DRAFT,
        paidProFirstReviewDisplayActive: true,
        isAuthoritativePaidProReviewActive: true,
      }),
    ).toBe(false);
    expect(intake).toContain("suppressFreeStarterCreateFlowConversionUi");
    expect(intake).toContain("!suppressFreeStarterCreateFlowConversionUi");
  });

  it("5 — commitAcceptedPaidProCorpusHandoffSync + canonical entry plan mount SimpleProFinalReview", () => {
    const draft = test504Draft(TEST504_STARTER_PREVIEW, TEST504_ACCEPTED_PAID_BODY);
    const committed = commitAcceptedPaidProCorpusHandoffSync({
      corpusPlain: TEST504_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
    });
    expect(committed).toBe(true);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: false,
      corpusPlain: TEST504_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST504_INTAKE,
      recipientCandidates: TEST504_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.refs.authoritativeAgreementSnapshot.length).toBeGreaterThanOrEqual(
      GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN,
    );
    expect(
      shouldMountSimpleProFinalReviewForCanonicalEntry({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: plan.ui.createFlowPhase,
        guidedCompletionPhase: plan.ui.guidedCompletionPhase,
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);
  });

  it("6 — intake wires synchronous corpus handoff before canonical review entry", () => {
    expect(intake).toContain(ACCEPTED_PAID_PRO_CORPUS_HANDOFF_HELPER);
    expect(intake).toContain(CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER);
    expect(intake).toContain("authoritativeAgreementSnapshotRef.current = plan.refs.authoritativeAgreementSnapshot");
    const rewriteIdx = intake.indexOf("const runEntitledPremiumImprovementRewrite = React.useCallback");
    const rewriteBlock = intake.slice(rewriteIdx, rewriteIdx + 18000);
    expect(rewriteBlock).toContain("commitAcceptedPaidProCorpusHandoffSync");
    expect(rewriteBlock).toContain("authoritativeAgreementSnapshotRef.current = finalPlain");
  });

  it("7 — Sarah Mitchell / Michael Torres signer metadata handoff from intake bullets", () => {
    const draft = test504Draft(TEST504_STARTER_PREVIEW, TEST504_ACCEPTED_PAID_BODY);
    const handoff = planCanonicalPaidProSignerHandoff({
      draft,
      intakeText: TEST504_INTAKE,
      corpusPlain: TEST504_ACCEPTED_PAID_BODY,
      recipientCandidates: TEST504_RECIPIENT_CANDIDATES,
    });
    expect(handoff).not.toBeNull();
    expect(handoff!.signerNames[0]).toMatch(/Sarah Mitchell/i);
    expect(handoff!.signerTitles[0]).toMatch(/CEO/i);
    expect(handoff!.signerNames[1]).toMatch(/Michael Torres/i);
    expect(handoff!.signerTitles[1]).toMatch(/President/i);
    expect(handoff!.partyLegalNames[0]).toContain("Red Mesa Logistics LLC");
    expect(handoff!.partyLegalNames[1]).toContain("Harbor Peak Automation LLC");
  });
});
