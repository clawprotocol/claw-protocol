import { describe, expect, it } from "vitest";
import {
  resolvePaidProReviewDecisionPhase,
  resolvePostFinalizeReviewDecisionActive,
  shouldHidePaidProReviewDecisionChromeForDashboardResume,
  shouldShowPaidProReviewDecisionChrome,
} from "./paidProReviewDecisionModel";

describe("paidProReviewDecisionModel", () => {
  it("Decision 1 precedes signer setup", () => {
    expect(
      resolvePaidProReviewDecisionPhase({
        firstReviewDeliveryTrackDecisionActive: true,
        paidProCanonicalReviewSignerSetupActive: false,
        paidProSignerMetadataFinalized: false,
        postFinalizeReviewDecisionActive: false,
      }),
    ).toBe("decision_1");
  });

  it("signer setup wins when mounted and not finalized", () => {
    expect(
      resolvePaidProReviewDecisionPhase({
        firstReviewDeliveryTrackDecisionActive: true,
        paidProCanonicalReviewSignerSetupActive: true,
        paidProSignerMetadataFinalized: false,
        postFinalizeReviewDecisionActive: false,
      }),
    ).toBe("signer_setup");
  });

  it("Decision 2 is intentional post-finalize confirmation", () => {
    expect(
      resolvePostFinalizeReviewDecisionActive({
        forcedFirstReviewActive: false,
        inlineSignerSetupMounted: false,
        signerMetadataFinalized: true,
        signaturePreparationRequested: false,
        deliveryTrackDecisionActive: false,
        paidFirstReviewSurfaceActive: true,
      }),
    ).toBe(true);
    expect(
      resolvePaidProReviewDecisionPhase({
        firstReviewDeliveryTrackDecisionActive: false,
        paidProCanonicalReviewSignerSetupActive: false,
        paidProSignerMetadataFinalized: true,
        postFinalizeReviewDecisionActive: true,
      }),
    ).toBe("decision_2");
  });

  it("shows decision chrome for decision 1 and 2 only", () => {
    expect(shouldShowPaidProReviewDecisionChrome("decision_1")).toBe(true);
    expect(shouldShowPaidProReviewDecisionChrome("decision_2")).toBe(true);
    expect(shouldShowPaidProReviewDecisionChrome("signer_setup")).toBe(false);
  });

  it("does not hide review-decision chrome after accept remount finalizes signers", () => {
    expect(
      shouldHidePaidProReviewDecisionChromeForDashboardResume({
        dashboardSignerSetupResumeUiActive: true,
        inlineSignerSetupMounted: false,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
    expect(
      shouldHidePaidProReviewDecisionChromeForDashboardResume({
        dashboardSignerSetupResumeUiActive: true,
        inlineSignerSetupMounted: true,
        signerMetadataFinalized: false,
      }),
    ).toBe(true);
  });
});
