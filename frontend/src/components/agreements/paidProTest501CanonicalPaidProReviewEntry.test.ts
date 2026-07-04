/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import {
  CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER,
  planCanonicalPaidProSignerHandoff,
  planEnterCanonicalPaidProReviewFlow,
  resolveCanonicalPaidProReviewCorpus,
  shouldBlockDegradedPaidReviewBranchesAfterAcceptance,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_INTAKE,
  TEST501_RECIPIENT_CANDIDATES,
  TEST501_STARTER_PREVIEW,
  test501Draft,
} from "./paidProTest501Fixtures";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST501 — canonical paid Pro review entry (post-checkout + returning create)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    getOrInitSessionAgreementGenerationId();
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
    vi.restoreAllMocks();
  });

  it("1 — intake wires both post-checkout and returning paid create through enterCanonicalPaidProReviewFlow", () => {
    expect(intake).toContain(CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER);
    const helperIdx = intake.indexOf("const enterCanonicalPaidProReviewFlow = React.useCallback(");
    expect(helperIdx).toBeGreaterThan(0);
    const helperBlock = intake.slice(helperIdx, helperIdx + 4200);
    expect(helperBlock).toContain("planEnterCanonicalPaidProReviewFlow");
    expect(helperBlock).toContain("commitCanonicalPaidProReviewSessionMarkers");
    expect(intake).toContain("<SimpleProFinalReviewScreen");
    expect(intake).toContain("simpleProFinalReviewActive");
    expect(intake).toContain('source: "post_checkout_apply_success"');
    expect(intake).toContain('source: "returning_paid_create"');
    expect(intake).toContain("commitPostCheckoutCanonicalReviewEntry");
  });

  it("2 — post-checkout and returning paid plans share the same review UI mount flags", () => {
    const draft = test501Draft(TEST501_STARTER_PREVIEW, TEST501_ACCEPTED_PAID_BODY);
    const baseArgs = {
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
      agreementGenerationId: getOrInitSessionAgreementGenerationId(),
      generationOutcome: "ok" as const,
    };
    const postCheckout = planEnterCanonicalPaidProReviewFlow({
      ...baseArgs,
      source: "post_checkout_apply_success",
      respectAlreadyOpened: false,
    });
    const returning = planEnterCanonicalPaidProReviewFlow({
      ...baseArgs,
      source: "returning_paid_create",
      respectAlreadyOpened: true,
      alreadyOpened: false,
    });
    expect(postCheckout.shouldApply).toBe(true);
    expect(returning.shouldApply).toBe(true);
    expect(postCheckout.ui).toEqual(returning.ui);
    expect(postCheckout.refs.acceptedReviewCorpus).toBe(returning.refs.acceptedReviewCorpus);
    expect(
      shouldMountSimpleProFinalReviewForCanonicalEntry({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: postCheckout.ui.createFlowPhase,
        guidedCompletionPhase: postCheckout.ui.guidedCompletionPhase,
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);
  });

  it("3 — returning paid cannot enter degraded branches after paid acceptance", () => {
    markPaidProPipelineValidationPassed({
      text: TEST501_ACCEPTED_PAID_BODY,
      source: "server_full_draft",
    });
    markPaidProPipelineAcceptedCorpusHash(TEST501_ACCEPTED_PAID_BODY);
    expect(
      shouldBlockDegradedPaidReviewBranchesAfterAcceptance({
        corpusPlain: TEST501_ACCEPTED_PAID_BODY,
        pipelineAccepted: true,
        guidedCompletionPhase: "applied",
      }),
    ).toBe(true);
    expect(intake).toContain("shouldBlockDegradedPaidReviewBranchesAfterAcceptance");
    const panelIdx = intake.indexOf("const showPremiumNetworkRecoverablePanel = Boolean(");
    const panelBlock = intake.slice(panelIdx, panelIdx + 1400);
    expect(panelBlock).toContain("shouldBlockDegradedPaidReviewBranchesAfterAcceptance");
    expect(panelBlock).toContain("resolveCanonicalPaidProReviewCorpus");
  });

  it("4 — accepted paid corpus wins over starter/preview corpus", () => {
    markPaidProPipelineValidationPassed({
      text: TEST501_ACCEPTED_PAID_BODY,
      source: "server_full_draft",
    });
    markPaidProPipelineAcceptedCorpusHash(TEST501_ACCEPTED_PAID_BODY);
    const draft = test501Draft(TEST501_STARTER_PREVIEW, TEST501_ACCEPTED_PAID_BODY);
    const resolved = resolveCanonicalPaidProReviewCorpus({
      winningBody: TEST501_STARTER_PREVIEW,
      snapshotPlain: TEST501_STARTER_PREVIEW,
      draft,
      agreementDocumentText: TEST501_STARTER_PREVIEW,
      pipelineWinningBody: TEST501_ACCEPTED_PAID_BODY,
      hydratedPremiumBody: TEST501_STARTER_PREVIEW,
      premiumDeliverablePlain: TEST501_STARTER_PREVIEW,
    });
    expect(resolved.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(resolved).toContain("Red Mesa Logistics LLC");
    expect(resolved.length).toBeGreaterThan(TEST501_STARTER_PREVIEW.length * 2);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: true,
      alreadyOpened: false,
      corpusPlain: resolved,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.refs.agreementDocumentPlain.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
  });

  it("5 — authorized signer bullet lines hydrate Sarah Mitchell / Michael Torres metadata", () => {
    const draft = test501Draft(TEST501_STARTER_PREVIEW, TEST501_ACCEPTED_PAID_BODY);
    const handoff = planCanonicalPaidProSignerHandoff({
      draft,
      intakeText: TEST501_INTAKE,
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
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
