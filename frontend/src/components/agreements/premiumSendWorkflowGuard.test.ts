import { describe, expect, it } from "vitest";
import {
  commitReviewArtifact,
  getAuthoritativeApplyCount,
  isPremiumSendWorkflowPhase,
  resetCommittedReviewArtifactForTests,
  shouldSuppressPremiumAuthoritativeRehydrate,
} from "./committedReviewArtifact";

describe("premium send workflow guard", () => {
  it("suppresses rehydrate in recipient and ready_to_send phases", () => {
    expect(
      shouldSuppressPremiumAuthoritativeRehydrate({
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
    expect(
      shouldSuppressPremiumAuthoritativeRehydrate({
        createFlowPhase: "ready_to_send",
      }),
    ).toBe(true);
    expect(
      shouldSuppressPremiumAuthoritativeRehydrate({
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(false);
  });

  it("committed review artifact tracks single apply count", () => {
    resetCommittedReviewArtifactForTests();
    commitReviewArtifact({ plainText: "A".repeat(600), source: "premium_authoritative" });
    expect(getAuthoritativeApplyCount()).toBe(1);
    commitReviewArtifact({ plainText: "A".repeat(600), source: "premium_authoritative", bumpApplyCount: false });
    expect(getAuthoritativeApplyCount()).toBe(1);
  });

  it("identifies send workflow phases", () => {
    expect(isPremiumSendWorkflowPhase("recipient_setup_required")).toBe(true);
    expect(isPremiumSendWorkflowPhase("capturing_input")).toBe(false);
  });
});
