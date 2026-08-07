/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearPaidProPostAcceptanceValidatorCache,
  commitPaidProPipelineValidationAcceptance,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resolvePaidProDocumentBodyRouter,
  resolveShowPaidProReviewDocumentCard,
  shouldExitPaidProGeneratingDisplayPhase,
  shouldForcePaidProReviewDocumentRender,
} from "./paidProDocumentBodyRouter";
import {
  enablePaidProReviewInstrumentationForTests,
  resolvePaidProReviewBranchPath,
  resetPaidProReviewBranchInstrumentationForTests,
} from "./paidProReviewBranchInstrumentation";

const SERVICES_CORPUS = `${"SERVICES AGREEMENT\n\n".padEnd(1200, "x")}This Services Agreement is between Alex Rivera and PixelForge Labs.\n`.repeat(
  8,
);

beforeEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  getOrInitSessionAgreementGenerationId();
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  resetPaidProReviewBranchInstrumentationForTests();
  enablePaidProReviewInstrumentationForTests();
});

afterEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  resetPaidProReviewBranchInstrumentationForTests();
});

describe("paid Pro Review flash-then-empty regression", () => {
  it("keeps document card forced when pipeline corpus is accepted even if canDisplay is false", () => {
    expect(SERVICES_CORPUS.length).toBeGreaterThanOrEqual(PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN);
    commitPaidProPipelineValidationAcceptance({
      text: SERVICES_CORPUS,
      source: "server_full_draft",
    });

    expect(shouldForcePaidProReviewDocumentRender()).toBe(true);
    expect(resolvePaidProDocumentBodyRouter().forced).toBe(true);
    expect(
      resolveShowPaidProReviewDocumentCard({
        canDisplayPaidProAgreementDocument: false,
        dashboardSignerSetupResumeUiActive: false,
      }),
    ).toBe(true);

    const branch = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: resolveShowPaidProReviewDocumentCard({
        canDisplayPaidProAgreementDocument: false,
      }),
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: resolvePaidProDocumentBodyRouter().forced,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: true,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(branch.path).toBe("forced_embedded");
    expect(branch.path).not.toBe("blocked_can_display");
  });

  it("exits generating_draft once canonical corpus forces document render", () => {
    commitPaidProPipelineValidationAcceptance({
      text: SERVICES_CORPUS,
      source: "server_full_draft",
    });
    expect(
      shouldExitPaidProGeneratingDisplayPhase({
        displayPhase: "generating_draft",
        corpusForcesDocumentRender: shouldForcePaidProReviewDocumentRender(),
      }),
    ).toBe(true);
    expect(
      shouldExitPaidProGeneratingDisplayPhase({
        displayPhase: "review",
        corpusForcesDocumentRender: true,
      }),
    ).toBe(false);
  });

  it("SoT-established corpus still forces card when canDisplay lags", () => {
    establishPaidProSourceOfTruth({
      text: SERVICES_CORPUS,
      source: "server_full_draft",
      intakeText: "Alex Rivera PixelForge Labs services agreement",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(shouldForcePaidProReviewDocumentRender()).toBe(true);
    expect(
      resolveShowPaidProReviewDocumentCard({
        canDisplayPaidProAgreementDocument: false,
      }),
    ).toBe(true);
  });
});
